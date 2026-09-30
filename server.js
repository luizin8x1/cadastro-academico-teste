

require("dotenv").config();

const express = require("express");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const cors = require("cors");
const path = require("path");
const Anthropic = require("@anthropic-ai/sdk");
const PDFDocument = require("pdfkit");
const crypto = require("crypto");

const app = express();
app.use(cors());
app.use(express.json({
    limit: "2mb"
}));

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
app.use(express.static(path.join(__dirname, "public")));

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

pool
  .query("SELECT NOW()")
  .then(() => console.log("Conectado ao banco Neon com sucesso."))
  .catch((err) => console.error("Erro ao conectar no banco:", err.message));




// ---------- CADASTRO (nome/email/senha + perfil acadêmico, tudo de uma vez) ----------
app.post("/api/cadastro", async (req, res) => {
  const {
    nome,
    email,
    senha,
    dataNascimento,
    serie,
    redeEnsino,
    curso,
    universidade,
    tipoInstituicao,
    objetivo,
    objetivoOutro,
  } = req.body;

  if (
    !nome ||
    !email ||
    !senha ||
    !dataNascimento ||
    !serie ||
    !redeEnsino ||
    !curso ||
    !universidade ||
    !tipoInstituicao ||
    !objetivo
  ) {
    return res
      .status(400)
      .json({ erro: "Preencha todos os campos obrigatórios." });
  }
  if (senha.length < 6) {
    return res
      .status(400)
      .json({ erro: "A senha deve ter pelo menos 6 caracteres." });
  }

  try {
    const existe = await pool.query(
      "SELECT id FROM usuario WHERE email = $1",
      [email]
    );

    if (existe.rows.length > 0) {
      return res
        .status(400)
        .json({ erro: "Este e-mail já está cadastrado." });
    }

    const hash = await bcrypt.hash(senha, 10);

const redeEnsinoBanco =
  String(redeEnsino) === "1" ? "publica" :
  String(redeEnsino) === "2" ? "particular" :
  redeEnsino;

const tipoInstituicaoBanco =
  String(tipoInstituicao) === "1" ? "publica" :
  String(tipoInstituicao) === "2" ? "particular" :
  tipoInstituicao;

 const client = await pool.connect();

try {
  await client.query("BEGIN");

  // 1º INSERT: dados de acesso do usuário
  const resultadoUsuario = await client.query(
    `INSERT INTO usuario
      (nome, email, senha_hash)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [
      nome,
      email,
      hash
    ]
  );

  const usuarioId = resultadoUsuario.rows[0].id;

  // 2º INSERT: perfil acadêmico
  await client.query(
    `INSERT INTO perfil_academico
      (usuario_id, data_nascimento, serie, rede_ensino,
       curso_desejado, universidade_desejada,
       tipo_universidade, objetivo_geral)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
[
  usuarioId,
  dataNascimento,
  serie,
  redeEnsinoBanco,
  curso,
  universidade,
  tipoInstituicaoBanco,
  objetivo
]
  );

  await client.query("COMMIT");

  res.json({
    sucesso: true,
    usuarioId: usuarioId
  });

} catch (erro) {
  await client.query("ROLLBACK");
  throw erro;

} finally {
  client.release();
}

  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: "Erro ao cadastrar usuário." });
  }
});

// ---------- LOGIN ----------
app.post("/api/login", async (req, res) => {
  const { email, senha } = req.body;

  if (!email || !senha) {
    return res.status(400).json({
      erro: "Preencha e-mail e senha."
    });
  }

  try {

    const resultado = await pool.query(
  `SELECT id, nome, email, senha_hash, tipo_usuario, status
   FROM usuario
   WHERE LOWER(email) = LOWER($1)`,
  [email.trim()]
);

    if (resultado.rows.length === 0) {
      return res.status(401).json({
        erro: "E-mail ou senha inválidos."
      });
    }

    const usuario = resultado.rows[0];

    const senhaCorreta = await bcrypt.compare(
      senha,
      usuario.senha_hash
    );

    if (!senhaCorreta) {
      return res.status(401).json({
        erro: "E-mail ou senha inválidos."
      });
    }

    return res.json({
  sucesso: true,
  usuarioId: usuario.id,
  nome: usuario.nome,
  email: usuario.email,
  tipoUsuario: usuario.tipo_usuario
});

  } catch (err) {

    console.error("Erro no login:", err);

    return res.status(500).json({
      erro: "Erro ao entrar."
    });
  }
});

// =====================================================
// BUSCAR DADOS DO USUÁRIO + PERFIL ACADÊMICO
// =====================================================
app.get("/api/perfil/:usuarioId", async (req, res) => {

    const usuarioId = parseInt(req.params.usuarioId, 10);

    if (isNaN(usuarioId)) {
        return res.status(400).json({
            erro: "ID de usuário inválido."
        });
    }

    try {

        const resultado = await pool.query(
            `
            SELECT
                u.nome,
                u.email,

                TO_CHAR(pa.data_nascimento, 'YYYY-MM-DD') AS data_nascimento,
                pa.serie,
                pa.etapa_atual,
                pa.escola,
                pa.rede_ensino,
                pa.curso_desejado,
                pa.universidade_desejada,
                pa.tipo_universidade,
                pa.objetivo_geral,
                pa.trilha_sesi,
                pa.etapa_sesi

            FROM usuario u

            LEFT JOIN perfil_academico pa
                ON pa.usuario_id = u.id

            WHERE u.id = $1
            `,
            [usuarioId]
        );

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                erro: "Usuário não encontrado."
            });
        }

        const linha = resultado.rows[0];

        return res.json({

            // Dados da conta
            nome: linha.nome,
            email: linha.email,

            // Perfil acadêmico
            dataNascimento: linha.data_nascimento,
            serie: linha.serie,
            etapaAtual: linha.etapa_atual,
            escola: linha.escola,
            redeEnsino: linha.rede_ensino,
            cursoDesejado: linha.curso_desejado,
            universidadeDesejada: linha.universidade_desejada,
            tipoUniversidade: linha.tipo_universidade,
            objetivoGeral: linha.objetivo_geral,
            trilhaSesi: linha.trilha_sesi,
            etapaSesi: linha.etapa_sesi
        });

    } catch (erro) {

        console.error("❌ ERRO AO BUSCAR PERFIL:");
        console.error("Mensagem:", erro.message);
        console.error("Código:", erro.code);
        console.error(erro);

        return res.status(500).json({
            sucesso: false,
            erro: "Erro ao buscar perfil do usuário.",
            detalhe: erro.message,
            codigo: erro.code
        });
    }
});

// ---------- ATUALIZAR PERFIL ACADÊMICO ----------
app.put("/api/perfil/:usuarioId", async (req, res) => {
  const usuarioId = parseInt(req.params.usuarioId, 10);

  if (isNaN(usuarioId)) {
    return res.status(400).json({ erro: "ID de usuário inválido." });
  }

  const {
    dataNascimento,
    serie,
    redeEnsino,
    curso,
    universidade,
    tipoInstituicao,
    objetivo,
    objetivoOutro,
  } = req.body;

  if (
    !dataNascimento ||
    !serie ||
    !redeEnsino ||
    !curso ||
    !universidade ||
    !tipoInstituicao ||
    !objetivo
  ) {
    return res
      .status(400)
      .json({ erro: "Preencha todos os campos obrigatórios." });
  }

  try {
    const resultado = await pool.query(
      `UPDATE usuario SET
        data_nascimento = $1,
        serie = $2,
        rede_de_ensino = $3,
        curso = $4,
        universidade = $5,
        tipo_instituicao_superior = $6,
        objetivo = $7,
        objetivo_outro = $8
       WHERE id = $9
       RETURNING id`,
      [
        dataNascimento,
        serie,
        redeEnsino,
        curso,
        universidade,
        tipoInstituicao,
        objetivo,
        objetivoOutro || null,
        usuarioId,
      ]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: "Usuário não encontrado." });
    }

    res.json({ sucesso: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: "Erro ao atualizar perfil." });
  }
});


// =====================================================
// PERFIL ACADÊMICO - DIFICULDADES
// =====================================================

// =====================================================
// BUSCAR DIFICULDADES DO ALUNO
// =====================================================

app.get("/api/perfil-dificuldades/:usuarioId", async (req, res) => {

    const usuarioId =
        parseInt(req.params.usuarioId, 10);


    if (!Number.isInteger(usuarioId) || usuarioId <= 0) {

        return res.status(400).json({
            sucesso: false,
            erro: "ID de usuário inválido."
        });

    }


    try {

        // ==========================================
        // DISCIPLINAS E CONTEÚDOS DE DIFICULDADE
        // ==========================================

        const resultadoDificuldades =
            await pool.query(
                `
                SELECT
                    pd.id,
                    pd.disciplina_id,
                    d.nome AS disciplina,
                    pd.conteudo_1,
                    pd.conteudo_2,
                    pd.conteudo_3

                FROM perfil_dificuldade pd

                INNER JOIN disciplina d
                    ON d.id = pd.disciplina_id

                WHERE pd.usuario_id = $1

                ORDER BY d.nome
                `,
                [usuarioId]
            );


        // ==========================================
        // MATÉRIA QUE PRATICAMENTE NÃO ESTUDA
        // ==========================================

        const resultadoPerfil =
            await pool.query(
                `
                SELECT
                    disciplina_nao_estuda_id,
                    nao_estuda_nenhuma,
                    motivo_nao_estuda

                FROM perfil_academico

                WHERE usuario_id = $1
                `,
                [usuarioId]
            );


        const perfil =
            resultadoPerfil.rows[0] || null;


        let disciplinaNaoEstuda = "";


        if (perfil) {

            if (perfil.nao_estuda_nenhuma) {

                disciplinaNaoEstuda =
                    "nenhuma";

            } else if (
                perfil.disciplina_nao_estuda_id
            ) {

                disciplinaNaoEstuda =
                    String(
                        perfil.disciplina_nao_estuda_id
                    );

            }

        }


        return res.json({

            sucesso: true,

            dificuldades:
                resultadoDificuldades.rows,

            disciplinaNaoEstuda,

            motivoNaoEstuda:
                perfil?.motivo_nao_estuda || ""

        });


    } catch (erro) {

        console.error(
            "❌ Erro ao buscar dificuldades:",
            erro
        );


        return res.status(500).json({

            sucesso: false,

            erro:
                "Erro ao buscar dificuldades do aluno."

        });

    }

});

// =====================================================
// SALVAR / ATUALIZAR DIFICULDADES DO ALUNO
// =====================================================

app.put("/api/perfil-dificuldades/:usuarioId", async (req, res) => {

    const usuarioId =
        parseInt(req.params.usuarioId, 10);


    if (!Number.isInteger(usuarioId) || usuarioId <= 0) {

        return res.status(400).json({
            sucesso: false,
            erro: "ID de usuário inválido."
        });

    }


    const {
        dificuldades,
        disciplinaNaoEstuda,
        motivoNaoEstuda
    } = req.body;


    // ==========================================
    // VALIDAR DIFICULDADES
    // ==========================================

    if (!Array.isArray(dificuldades)) {

        return res.status(400).json({
            sucesso: false,
            erro: "Lista de dificuldades inválida."
        });

    }


    if (
        dificuldades.length === 0 ||
        dificuldades.length > 3
    ) {

        return res.status(400).json({
            sucesso: false,
            erro:
                "Selecione entre 1 e 3 disciplinas."
        });

    }


    // ==========================================
    // VALIDAR MATÉRIA QUE NÃO ESTUDA
    // ==========================================

    if (!disciplinaNaoEstuda) {

        return res.status(400).json({
            sucesso: false,
            erro:
                "Responda se existe alguma matéria que você praticamente não estuda."
        });

    }


    const marcouNenhuma =
        disciplinaNaoEstuda === "nenhuma";


    let disciplinaNaoEstudaId = null;


    if (!marcouNenhuma) {

        disciplinaNaoEstudaId =
            parseInt(
                disciplinaNaoEstuda,
                10
            );


        if (
            !Number.isInteger(
                disciplinaNaoEstudaId
            )
        ) {

            return res.status(400).json({
                sucesso: false,
                erro:
                    "Disciplina não estudada inválida."
            });

        }


        if (
            !String(
                motivoNaoEstuda || ""
            ).trim()
        ) {

            return res.status(400).json({
                sucesso: false,
                erro:
                    "Informe por que você praticamente não estuda essa matéria."
            });

        }

    }


    const motivoFinal =
        marcouNenhuma
            ? null
            : String(
                motivoNaoEstuda || ""
            ).trim();


    const client =
        await pool.connect();


    try {

        await client.query("BEGIN");


        // ==========================================
        // APAGAR DIFICULDADES ANTIGAS
        // ==========================================

        await client.query(
            `
            DELETE FROM perfil_dificuldade

            WHERE usuario_id = $1
            `,
            [usuarioId]
        );


        // ==========================================
        // SALVAR DIFICULDADES ATUAIS
        // ==========================================

        for (const item of dificuldades) {

            const disciplinaId =
                parseInt(
                    item.disciplinaId,
                    10
                );


            if (
                !Number.isInteger(
                    disciplinaId
                )
            ) {

                throw new Error(
                    "Disciplina inválida."
                );

            }


            await client.query(
                `
                INSERT INTO perfil_dificuldade
                (
                    usuario_id,
                    disciplina_id,
                    conteudo_1,
                    conteudo_2,
                    conteudo_3,
                    atualizado_em
                )

                VALUES (
                    $1,
                    $2,
                    $3,
                    $4,
                    $5,
                    CURRENT_TIMESTAMP
                )
                `,
                [
                    usuarioId,
                    disciplinaId,
                    item.conteudo1?.trim() || null,
                    item.conteudo2?.trim() || null,
                    item.conteudo3?.trim() || null
                ]
            );

        }


        // ==========================================
        // SALVAR MATÉRIA QUE NÃO ESTUDA
        // ==========================================

        const resultadoPerfil =
            await client.query(
                `
                UPDATE perfil_academico

                SET
                    disciplina_nao_estuda_id = $1,
                    nao_estuda_nenhuma = $2,
                    motivo_nao_estuda = $3

                WHERE usuario_id = $4

                RETURNING usuario_id
                `,
                [
                    disciplinaNaoEstudaId,
                    marcouNenhuma,
                    motivoFinal,
                    usuarioId
                ]
            );


        if (
            resultadoPerfil.rowCount === 0
        ) {

            throw new Error(
                "Perfil Acadêmico não encontrado."
            );

        }


        await client.query("COMMIT");


        return res.json({

            sucesso: true,

            mensagem:
                "Dificuldades salvas com sucesso."

        });


    } catch (erro) {

        await client.query(
            "ROLLBACK"
        );


        console.error(
            "❌ Erro ao salvar dificuldades:",
            erro
        );


        return res.status(500).json({

            sucesso: false,

            erro:
                "Erro ao salvar dificuldades."

        });


    } finally {

        client.release();

    }

});


// =====================================================
// BUSCAR TEMPO DISPONÍVEL PARA ESTUDOS
// =====================================================

app.get("/api/perfil-tempo-estudo/:usuarioId", async (req, res) => {

    const usuarioId = parseInt(req.params.usuarioId, 10);

    if (isNaN(usuarioId)) {
        return res.status(400).json({
            sucesso: false,
            erro: "ID de usuário inválido."
        });
    }

    try {

        const resultado = await pool.query(
            `
            SELECT
                usuario_id,
                tempo_atual_minutos,
                dias_disponiveis,
                periodo_preferido,
                tempo_disponivel_minutos,
                fim_semana,
                periodo_livre,
                atualizado_em
            FROM perfil_tempo_estudo
            WHERE usuario_id = $1
            `,
            [usuarioId]
        );

        if (resultado.rows.length === 0) {
            return res.json({
                sucesso: true,
                tempoEstudo: null
            });
        }

        return res.json({
            sucesso: true,
            tempoEstudo: resultado.rows[0]
        });

    } catch (erro) {

        console.error("❌ Erro ao buscar tempo de estudo:", erro);

        return res.status(500).json({
            sucesso: false,
            erro: "Erro ao buscar tempo disponível para estudos."
        });
    }
});


// =====================================================
// SALVAR / ATUALIZAR TEMPO DISPONÍVEL PARA ESTUDOS
// =====================================================

app.put("/api/perfil-tempo-estudo/:usuarioId", async (req, res) => {

    const usuarioId = parseInt(req.params.usuarioId, 10);

    if (isNaN(usuarioId)) {
        return res.status(400).json({
            sucesso: false,
            erro: "ID de usuário inválido."
        });
    }

    const {
        horasAtuais,
        diasDisponiveis,
        periodoPreferido,
        tempoDisponivel,
        fimSemana,
        periodoLivre
    } = req.body;

    // =====================================================
    // VALIDAÇÕES
    // =====================================================

    if (
        horasAtuais === undefined ||
        horasAtuais === null ||
        horasAtuais === ""
    ) {
        return res.status(400).json({
            sucesso: false,
            erro: "Informe quanto tempo o aluno estuda atualmente."
        });
    }

    if (!Array.isArray(diasDisponiveis) || diasDisponiveis.length === 0) {
        return res.status(400).json({
            sucesso: false,
            erro: "Informe pelo menos um dia disponível para estudos."
        });
    }

    if (!periodoPreferido) {
        return res.status(400).json({
            sucesso: false,
            erro: "Informe o período preferido para estudos."
        });
    }

    if (
        tempoDisponivel === undefined ||
        tempoDisponivel === null ||
        tempoDisponivel === ""
    ) {
        return res.status(400).json({
            sucesso: false,
            erro: "Informe o tempo disponível para estudos."
        });
    }

    if (!fimSemana) {
        return res.status(400).json({
            sucesso: false,
            erro: "Informe a disponibilidade no fim de semana."
        });
    }


    try {

        const resultado = await pool.query(
            `
            INSERT INTO perfil_tempo_estudo (
                usuario_id,
                tempo_atual_minutos,
                dias_disponiveis,
                periodo_preferido,
                tempo_disponivel_minutos,
                fim_semana,
                periodo_livre,
                atualizado_em
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)

            ON CONFLICT (usuario_id)

            DO UPDATE SET
                tempo_atual_minutos = EXCLUDED.tempo_atual_minutos,
                dias_disponiveis = EXCLUDED.dias_disponiveis,
                periodo_preferido = EXCLUDED.periodo_preferido,
                tempo_disponivel_minutos = EXCLUDED.tempo_disponivel_minutos,
                fim_semana = EXCLUDED.fim_semana,
                periodo_livre = EXCLUDED.periodo_livre,
                atualizado_em = CURRENT_TIMESTAMP

            RETURNING *
            `,
            [
                usuarioId,
                parseInt(horasAtuais, 10),
                diasDisponiveis,
                periodoPreferido,
                parseInt(tempoDisponivel, 10),
                fimSemana,
                periodoLivre?.trim() || null
            ]
        );

        return res.json({
            sucesso: true,
            mensagem: "Tempo disponível para estudos salvo com sucesso.",
            tempoEstudo: resultado.rows[0]
        });

    } catch (erro) {

        console.error("❌ Erro ao salvar tempo de estudo:", erro);

        return res.status(500).json({
            sucesso: false,
            erro: "Erro ao salvar tempo disponível para estudos."
        });
    }
});



// =====================================================
// LISTAR DISCIPLINAS
// =====================================================

app.get("/api/disciplinas", async (req, res) => {

    try {

        const resultado = await pool.query(`
            SELECT
                id,
                nome
            FROM disciplina
            ORDER BY nome
        `);

        return res.json({
            sucesso: true,
            disciplinas: resultado.rows
        });

    } catch (erro) {

        console.error("❌ Erro ao buscar disciplinas:", erro);

        return res.status(500).json({
            sucesso: false,
            erro: "Erro ao buscar disciplinas."
        });
    }
});



// ---------- CRONOGRAMA PERSONALIZADO ----------
app.get("/api/cronograma/:usuarioId", async (req, res) => {
  const usuarioId = parseInt(req.params.usuarioId, 10);

  if (isNaN(usuarioId)) {
    return res.status(400).json({ erro: "ID de usuário inválido." });
  }

  try {
    const resultado = await pool.query(
      `SELECT horas_por_dia, dias_semana, materias_dificeis,
              materia_dificil_outra, periodo_preferido, duracao_foco
       FROM cronograma_preferencias
       WHERE usuario_id = $1`,
      [usuarioId]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: "Cronograma ainda não preenchido." });
    }

    const linha = resultado.rows[0];

    res.json({
      horasPorDia: linha.horas_por_dia,
      diasSemana: linha.dias_semana,
      materiasDificeis: linha.materias_dificeis,
      materiaDificilOutra: linha.materia_dificil_outra,
      periodoPreferido: linha.periodo_preferido,
      duracaoFoco: linha.duracao_foco,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: "Erro ao buscar cronograma." });
  }
});

app.post("/api/cronograma/:usuarioId", async (req, res) => {
  const usuarioId = parseInt(req.params.usuarioId, 10);

  if (isNaN(usuarioId)) {
    return res.status(400).json({ erro: "ID de usuário inválido." });
  }

  const {
    horasPorDia,
    diasSemana,
    materiasDificeis,
    materiaDificilOutra,
    periodoPreferido,
    duracaoFoco,
  } = req.body;

  if (
    horasPorDia === undefined ||
    horasPorDia === null ||
    horasPorDia === "" ||
    !Array.isArray(diasSemana) ||
    diasSemana.length === 0 ||
    !Array.isArray(materiasDificeis) ||
    materiasDificeis.length === 0 ||
    !periodoPreferido ||
    !duracaoFoco
  ) {
    return res
      .status(400)
      .json({ erro: "Preencha todas as perguntas obrigatórias." });
  }

  try {
    const usuarioExiste = await pool.query(
      "SELECT id FROM usuario WHERE id = $1",
      [usuarioId]
    );

    if (usuarioExiste.rows.length === 0) {
      return res.status(404).json({ erro: "Usuário não encontrado." });
    }

    await pool.query(
      `INSERT INTO cronograma_preferencias
        (usuario_id, horas_por_dia, dias_semana, materias_dificeis,
         materia_dificil_outra, periodo_preferido, duracao_foco)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (usuario_id) DO UPDATE SET
         horas_por_dia = EXCLUDED.horas_por_dia,
         dias_semana = EXCLUDED.dias_semana,
         materias_dificeis = EXCLUDED.materias_dificeis,
         materia_dificil_outra = EXCLUDED.materia_dificil_outra,
         periodo_preferido = EXCLUDED.periodo_preferido,
         duracao_foco = EXCLUDED.duracao_foco,
         atualizado_em = NOW()`,
      [
        usuarioId,
        horasPorDia,
        diasSemana,
        materiasDificeis,
        materiaDificilOutra || null,
        periodoPreferido,
        duracaoFoco,
      ]
    );

    res.json({ sucesso: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: "Erro ao salvar cronograma." });
  }
});

// ---------- ASSISTENTE IA (cronograma personalizado, sem chat) ----------
// Mapas para transformar os códigos salvos no banco em texto legível para o prompt.
const SERIE_LABELS = {
  1: "5º Ano - Ensino Fundamental",
  2: "6º Ano - Ensino Fundamental",
  3: "7º Ano - Ensino Fundamental",
  4: "8º Ano - Ensino Fundamental",
  5: "9º Ano - Ensino Fundamental",
  6: "1º Ano - Ensino Médio",
  7: "2º Ano - Ensino Médio",
  8: "3º Ano - Ensino Médio",
};
const REDE_LABELS = { 1: "Pública", 2: "Particular" };
const OBJETIVO_LABELS = {
  1: "Passar no ENEM",
  2: "Passar no vestibular",
  3: "Melhorar as notas",
  4: "Organizar os estudos",
  5: "Recuperação escolar",
  6: "Concurso",
  7: "Outro",
};
const PERIODO_LABELS = { 1: "Manhã", 2: "Tarde", 3: "Noite", 4: "Madrugada" };
const DURACAO_LABELS = {
  1: "15 minutos",
  2: "25 minutos",
  3: "30 minutos",
  4: "45 minutos",
  5: "1 hora ou mais",
};
const DIA_LABELS = {
  seg: "Segunda-feira",
  ter: "Terça-feira",
  qua: "Quarta-feira",
  qui: "Quinta-feira",
  sex: "Sexta-feira",
  sab: "Sábado",
  dom: "Domingo",
};
const DIAS_ORDEM = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"];
const MATERIA_LABELS = {
  matematica: "Matemática",
  portugues: "Português",
  fisica: "Física",
  quimica: "Química",
  biologia: "Biologia",
  historia: "História",
  geografia: "Geografia",
  ingles: "Inglês",
  redacao: "Redação",
  outra: "Outra",
};

function montarPromptAssistente(perfil, cronograma) {
  const serieTexto = SERIE_LABELS[perfil.serie] || "não informado";
  const redeTexto = REDE_LABELS[perfil.rede_de_ensino] || "não informado";
  const objetivoTexto =
    perfil.objetivo === 7
      ? `Outro (${perfil.objetivo_outro || "não especificado"})`
      : OBJETIVO_LABELS[perfil.objetivo] || "não informado";

  const diasTexto = (cronograma.dias_semana || [])
    .map((d) => DIA_LABELS[d] || d)
    .join(", ");

  const materiasTexto = (cronograma.materias_dificeis || [])
    .map((m) =>
      m === "outra"
        ? `Outra (${cronograma.materia_dificil_outra || "não especificado"})`
        : MATERIA_LABELS[m] || m
    )
    .join(", ");

  const periodoTexto = PERIODO_LABELS[cronograma.periodo_preferido] || "não informado";
  const duracaoTexto = DURACAO_LABELS[cronograma.duracao_foco] || "não informado";

  return `Você é um orientador de rotina e produtividade para estudantes.
Monte uma proposta de cronograma semanal de estudos PERSONALIZADO para este aluno, com base exclusivamente nos dados abaixo (não invente compromissos fixos como escola/trabalho que não foram informados).

Dados do perfil do aluno (criados na conta):
- Série/ano: ${serieTexto}
- Rede de ensino: ${redeTexto}
- Curso/foco: ${perfil.curso || "não informado"}
- Universidade de interesse: ${perfil.universidade || "não informado"}
- Tipo de instituição superior desejada: ${
    perfil.tipo_instituicao_superior != null
      ? REDE_LABELS[perfil.tipo_instituicao_superior] || "não informado"
      : "não informado"
  }
- Meta/objetivo principal: ${objetivoTexto}

Preferências de estudo (formulário de cronograma personalizado):
- Horas disponíveis por dia: ${cronograma.horas_por_dia}
- Dias da semana disponíveis: ${diasTexto || "não informado"}
- Matérias consideradas mais difíceis (precisam de mais atenção): ${materiasTexto || "não informado"}
- Período do dia preferido para estudar: ${periodoTexto}
- Duração ideal de cada bloco de foco: ${duracaoTexto}

Instruções:
- Distribua os estudos apenas nos dias da semana informados como disponíveis.
- Priorize as matérias difíceis nos horários de melhor concentração (dentro do período preferido informado).
- Use blocos de foco com a duração informada, incluindo pequenas pausas entre eles.
- Respeite o total de horas por dia informado (não ultrapasse).
- A rotina deve ajudar o aluno a atingir a meta/objetivo informado no perfil.
- Se algum dado estiver "não informado", monte algo simples e equilibrado para aquele ponto, sem inventar detalhes específicos.

Responda SOMENTE com um JSON válido, sem markdown, sem crases, no seguinte formato exato (inclua apenas os dias informados como disponíveis; para os demais dias, retorne "rotina": [] e um "resumo" curto dizendo que é um dia de descanso):
{
  "Segunda-feira": {
    "resumo": "uma frase curta explicando o foco do dia",
    "rotina": [
      { "horario": "19:00", "atividade": "Matemática - revisão de funções" }
    ]
  },
  "Terça-feira": { "resumo": "...", "rotina": [ ... ] },
  "Quarta-feira": { "resumo": "...", "rotina": [ ... ] },
  "Quinta-feira": { "resumo": "...", "rotina": [ ... ] },
  "Sexta-feira": { "resumo": "...", "rotina": [ ... ] },
  "Sábado": { "resumo": "...", "rotina": [ ... ] },
  "Domingo": { "resumo": "...", "rotina": [ ... ] }
}`;
}

// Gera (ou regenera) o cronograma personalizado via IA e salva em sugestoes_ia.
app.post("/api/assistente-ia/:usuarioId", async (req, res) => {
  const usuarioId = parseInt(req.params.usuarioId, 10);

  if (isNaN(usuarioId)) {
    return res.status(400).json({ erro: "ID de usuário inválido." });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res
      .status(500)
      .json({ erro: "GEMINI_API_KEY não configurada no servidor." });
  }

  try {
    const perfilResultado = await pool.query(
      `SELECT serie, rede_de_ensino, curso, universidade,
              tipo_instituicao_superior, objetivo, objetivo_outro
       FROM usuario WHERE id = $1`,
      [usuarioId]
    );

    if (perfilResultado.rows.length === 0) {
      return res.status(404).json({ erro: "Usuário não encontrado." });
    }

    const cronogramaResultado = await pool.query(
      `SELECT horas_por_dia, dias_semana, materias_dificeis,
              materia_dificil_outra, periodo_preferido, duracao_foco
       FROM cronograma_preferencias WHERE usuario_id = $1`,
      [usuarioId]
    );

    if (cronogramaResultado.rows.length === 0) {
      return res.status(404).json({
        erro: "Preencha o Cronograma Personalizado antes de gerar o Assistente IA.",
      });
    }

    const perfil = perfilResultado.rows[0];
    const cronograma = cronogramaResultado.rows[0];
    const prompt = montarPromptAssistente(perfil, cronograma);

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;

    const respostaGemini = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    });

    if (!respostaGemini.ok) {
      const erroAPI = await respostaGemini.json().catch(() => ({}));
      console.error("Erro da API Gemini:", erroAPI);
      return res.status(502).json({
        erro: `Erro ${respostaGemini.status} ao chamar a IA: ${
          erroAPI.error?.message || "Falha na requisição"
        }`,
      });
    }

    const data = await respostaGemini.json();

    if (!data.candidates || !data.candidates[0]?.content) {
      return res.status(502).json({ erro: "A IA não retornou uma resposta válida." });
    }

    const textoResposta = data.candidates[0].content.parts[0].text.trim();
    const limpo = textoResposta
      .replace(/^```json/i, "")
      .replace(/^```/, "")
      .replace(/```$/, "")
      .trim();

    let plano;
    try {
      plano = JSON.parse(limpo);
    } catch (e) {
      console.error("Erro no JSON retornado pela IA:", limpo);
      return res
        .status(502)
        .json({ erro: "A IA não respondeu no formato JSON correto." });
    }

    await pool.query(
      `INSERT INTO sugestoes_ia (usuario_id, sugestao)
       VALUES ($1, $2)
       ON CONFLICT (usuario_id) DO UPDATE SET
         sugestao = EXCLUDED.sugestao,
         gerado_em = NOW()`,
      [usuarioId, JSON.stringify(plano)]
    );

    res.json({ sucesso: true, plano });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: "Erro ao gerar cronograma com IA." });
  }
});


// =====================================================
// CONTATO - SALVAR MENSAGEM
// =====================================================
app.post('/api/contato', async (req, res) => {
    try {
        const { nome, email, telefone, assunto, mensagem } = req.body;

        // Campos obrigatórios
        if (!nome || !email || !assunto || !mensagem) {
            return res.status(400).json({
                success: false,
                erro: 'Preencha todos os campos obrigatórios.'
            });
        }

        // Validação básica de e-mail
        const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailValido.test(email)) {
            return res.status(400).json({
                success: false,
                erro: 'Informe um e-mail válido.'
            });
        }

        // Validação do telefone, caso tenha sido preenchido
        if (telefone) {
            const somenteNumeros = telefone.replace(/\D/g, '');

            if (somenteNumeros.length !== 10 && somenteNumeros.length !== 11) {
                return res.status(400).json({
                    success: false,
                    erro: 'Informe um telefone válido com DDD.'
                });
            }
        }

        // Limite da mensagem
        if (mensagem.length > 1500) {
            return res.status(400).json({
                success: false,
                erro: 'A mensagem deve possuir no máximo 1500 caracteres.'
            });
        }

        // Salva no banco
        const resultado = await pool.query(
            `
            INSERT INTO mensagens_contato
                (nome, email, telefone, assunto, mensagem)
            VALUES
                ($1, $2, $3, $4, $5)
            RETURNING id, criado_em
            `,
            [
                nome.trim(),
                email.trim().toLowerCase(),
                telefone ? telefone.trim() : null,
                assunto,
                mensagem.trim()
            ]
        );

        return res.status(201).json({
            success: true,
            mensagem: 'Mensagem enviada com sucesso!',
            id: resultado.rows[0].id
        });

    } catch (erro) {
        console.error('Erro ao salvar mensagem de contato:', erro);

        return res.status(500).json({
            success: false,
            erro: 'Não foi possível enviar a mensagem.'
        });
    }
});



// Busca a última sugestão de IA já gerada e salva para este usuário.
app.get("/api/assistente-ia/:usuarioId", async (req, res) => {
  const usuarioId = parseInt(req.params.usuarioId, 10);

  if (isNaN(usuarioId)) {
    return res.status(400).json({ erro: "ID de usuário inválido." });
  }

  try {
    const resultado = await pool.query(
      `SELECT sugestao, gerado_em FROM sugestoes_ia WHERE usuario_id = $1`,
      [usuarioId]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: "Nenhuma sugestão gerada ainda." });
    }

    let plano;
    try {
      plano = JSON.parse(resultado.rows[0].sugestao);
    } catch (e) {
      return res.status(500).json({ erro: "Sugestão salva está corrompida." });
    }

    res.json({
      plano,
      geradoEm: resultado.rows[0].gerado_em,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: "Erro ao buscar sugestão salva." });
  }
});

const PORT = process.env.PORT || 3000;

// ======================================================
// ESTATÍSTICAS PÚBLICAS DO ROTA DO SUCESSO
// ======================================================

app.get("/api/estatisticas", async (req, res) => {
  try {

    // Total de usuários ativos
    const resultadoUsuarios = await pool.query(`
      SELECT COUNT(*)::int AS total_usuarios
      FROM usuario
      WHERE status = 'ativo'
    `);

    // Total de horas planejadas nos planos de estudo
    const resultadoHoras = await pool.query(`
      SELECT
        COALESCE(
          ROUND(SUM(duracao_min)::numeric / 60, 1),
          0
        ) AS total_horas
      FROM plano_estudo_item
    `);

    res.json({
      sucesso: true,
      totalUsuarios: resultadoUsuarios.rows[0].total_usuarios,
      horasPlanejadas: Number(resultadoHoras.rows[0].total_horas)
    });

  } catch (erro) {

    console.error("Erro ao buscar estatísticas:", erro);

    res.status(500).json({
      sucesso: false,
      erro: "Erro ao buscar estatísticas."
    });

  }
});

// ======================================================
// ROTINA DIÁRIA - CONSULTAR ROTINA DO USUÁRIO
// ======================================================

app.get("/api/rotina/:usuarioId", async (req, res) => {
  const { usuarioId } = req.params;

  try {

    // Busca a rotina ativa mais recente do usuário
    const resultadoRotina = await pool.query(
      `
      SELECT
        id,
        usuario_id,
        nome,
        preferencia_periodo,
        duracao_bloco_min,
        intervalo_min,
        rotina_variavel,
        ativa,
        criada_em,
        atualizada_em
      FROM rotina
      WHERE usuario_id = $1
        AND ativa = true
      ORDER BY atualizada_em DESC, criada_em DESC
      LIMIT 1
      `,
      [usuarioId]
    );

    // Usuário ainda não possui rotina
    if (resultadoRotina.rows.length === 0) {
      return res.json({
        sucesso: true,
        existe: false,
        rotina: null
      });
    }

    const rotina = resultadoRotina.rows[0];

    // Busca os compromissos da rotina
    const resultadoItens = await pool.query(
      `
      SELECT
        id,
        rotina_id,
        dia_semana,
        hora_inicio,
        hora_fim,
        tipo_atividade,
        descricao,
        tempo_deslocamento_min,
        fixo,
        bloqueia_estudo
      FROM rotina_item
      WHERE rotina_id = $1
      ORDER BY dia_semana ASC, hora_inicio ASC
      `,
      [rotina.id]
    );

    return res.json({
      sucesso: true,
      existe: true,
      rotina: {
        ...rotina,
        itens: resultadoItens.rows
      }
    });

  } catch (erro) {

    console.error("Erro ao consultar rotina:", erro);

    return res.status(500).json({
      sucesso: false,
      erro: "Erro ao consultar a rotina diária.",
      detalhe: erro.message
    });

  }
});

// =====================================================
// SALVAR ROTINA DIÁRIA
// =====================================================

app.post("/api/rotina", async (req, res) => {

    const { usuarioId, itens } = req.body;

    if (!usuarioId) {
        return res.status(400).json({
            sucesso: false,
            erro: "Usuário não informado."
        });
    }

    if (!Array.isArray(itens) || itens.length === 0) {
        return res.status(400).json({
            sucesso: false,
            erro: "Cadastre pelo menos um compromisso."
        });
    }

    const client = await pool.connect();

    try {

        await client.query("BEGIN");

        // Verifica se o usuário já possui rotina ativa
        const rotinaExistente = await client.query(
            `SELECT id
             FROM rotina
             WHERE usuario_id = $1
             AND ativa = true
             LIMIT 1`,
            [usuarioId]
        );

        let rotinaId;

        if (rotinaExistente.rows.length > 0) {

            rotinaId = rotinaExistente.rows[0].id;

            // Atualiza a data da rotina
            await client.query(
                `UPDATE rotina
                 SET atualizada_em = CURRENT_TIMESTAMP
                 WHERE id = $1`,
                [rotinaId]
            );

            // Remove os itens antigos para gravar a versão atual
            await client.query(
                `DELETE FROM rotina_item
                 WHERE rotina_id = $1`,
                [rotinaId]
            );

        } else {

            // Cria a rotina
            const novaRotina = await client.query(
                `INSERT INTO rotina
                    (usuario_id, nome, ativa, criada_em, atualizada_em)
                 VALUES
                    ($1, $2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                 RETURNING id`,
                [
                    usuarioId,
                    "Rotina diária"
                ]
            );

            rotinaId = novaRotina.rows[0].id;
        }

        // Insere todos os compromissos
        for (const item of itens) {

            await client.query(
                `INSERT INTO rotina_item
                    (
                        rotina_id,
                        dia_semana,
                        hora_inicio,
                        hora_fim,
                        tipo_atividade,
                        descricao,
                        fixo,
                        bloqueia_estudo
                    )
                 VALUES
                    ($1, $2, $3, $4, $5, $6, true, true)`,
                [
                    rotinaId,
                    item.diaSemana,
                    item.horaInicio || null,
                    item.horaFim || null,
                    item.tipoAtividade,
                    item.descricao
                ]
            );
        }

        await client.query("COMMIT");

        res.json({
            sucesso: true,
            mensagem: "Rotina salva com sucesso!",
            rotinaId
        });

    } catch (erro) {

        await client.query("ROLLBACK");

        console.error("Erro ao salvar rotina:", erro);

        res.status(500).json({
            sucesso: false,
            erro: "Erro ao salvar rotina."
        });

    } finally {

        client.release();
    }
});

// =====================================================
// EXCLUIR ROTINA DIÁRIA
// =====================================================

app.delete("/api/rotina/:usuarioId", async (req, res) => {

    const usuarioId = Number(req.params.usuarioId);

    if (!usuarioId) {
        return res.status(400).json({
            sucesso: false,
            erro: "Usuário não informado."
        });
    }

    const client = await pool.connect();

    try {

        await client.query("BEGIN");

        // Procura a rotina ativa do usuário
        const resultadoRotina = await client.query(
            `SELECT id
             FROM rotina
             WHERE usuario_id = $1
             AND ativa = true
             LIMIT 1`,
            [usuarioId]
        );

        if (resultadoRotina.rows.length === 0) {

            await client.query("ROLLBACK");

            return res.status(404).json({
                sucesso: false,
                erro: "Nenhuma rotina encontrada."
            });
        }

        const rotinaId = resultadoRotina.rows[0].id;

        // Primeiro remove os compromissos
        await client.query(
            `DELETE FROM rotina_item
             WHERE rotina_id = $1`,
            [rotinaId]
        );

        // Depois remove a rotina
        await client.query(
            `DELETE FROM rotina
             WHERE id = $1`,
            [rotinaId]
        );

        await client.query("COMMIT");

        return res.json({
            sucesso: true,
            mensagem: "Rotina excluída com sucesso!"
        });

    } catch (erro) {

        await client.query("ROLLBACK");

        console.error("Erro ao excluir rotina:", erro);

        return res.status(500).json({
            sucesso: false,
            erro: "Erro ao excluir rotina."
        });

    } finally {

        client.release();
    }
});

// =====================================================
// FRASES MOTIVACIONAIS - CADASTRAR NOVA FRASE
// =====================================================
app.post("/api/frases-motivacionais", async (req, res) => {

    const { frase, autor } = req.body;

    // Validação
    if (!frase || !frase.trim()) {
        return res.status(400).json({
            sucesso: false,
            erro: "A frase é obrigatória."
        });
    }

    try {

        const resultado = await pool.query(
            `
            INSERT INTO frase_motivacional
                (frase, autor)
            VALUES
                ($1, $2)
            RETURNING
                id,
                frase,
                autor,
                ativa,
                criado_em;
            `,
            [
                frase.trim(),
                autor?.trim() || null
            ]
        );

        return res.status(201).json({
            sucesso: true,
            mensagem: "Frase cadastrada com sucesso!",
            frase: resultado.rows[0]
        });

    } catch (erro) {

        console.error("❌ ERRO AO CADASTRAR FRASE:");
        console.error(erro);

        return res.status(500).json({
            sucesso: false,
            erro: "Erro ao cadastrar a frase.",
            detalhe: erro.message
        });
    }

});

// =====================================================
// FRASE MOTIVACIONAL ALEATÓRIA
// =====================================================

app.get("/api/frase-aleatoria", async (req, res) => {
  try {

    const resultado = await pool.query(`
      SELECT id, frase, autor
      FROM frase_motivacional
      WHERE ativa = true
      ORDER BY RANDOM()
      LIMIT 1
    `);

    if (resultado.rows.length === 0) {
      return res.status(404).json({
        sucesso: false,
        erro: "Nenhuma frase motivacional disponível."
      });
    }

    return res.json({
      sucesso: true,
      frase: resultado.rows[0]
    });

  } catch (erro) {

    console.error("❌ ERRO AO BUSCAR FRASE MOTIVACIONAL:");
    console.error(erro);

    return res.status(500).json({
      sucesso: false,
      erro: "Erro ao buscar frase motivacional.",
      detalhe: erro.message
    });
  }
});

// =====================================================
// ADMIN - FRASES MOTIVACIONAIS
// =====================================================


// ---------- LISTAR TODAS AS FRASES ----------
app.get("/api/admin/frases", async (req, res) => {
  try {

    const resultado = await pool.query(`
      SELECT id, frase, autor, ativa
      FROM frase_motivacional
      ORDER BY id ASC
    `);

    res.json({
      sucesso: true,
      frases: resultado.rows
    });

  } catch (erro) {

    console.error("❌ ERRO AO LISTAR FRASES:");
    console.error(erro);

    res.status(500).json({
      sucesso: false,
      erro: "Erro ao buscar frases motivacionais.",
      detalhe: erro.message
    });
  }
});


// ---------- ADICIONAR NOVA FRASE ----------
app.post("/api/admin/frases", async (req, res) => {

  const { frase, autor } = req.body;

  if (!frase || !autor) {
    return res.status(400).json({
      sucesso: false,
      erro: "Informe a frase e o autor."
    });
  }

  try {

    const resultado = await pool.query(
      `
      INSERT INTO frase_motivacional
        (frase, autor, ativa)
      VALUES
        ($1, $2, true)
      RETURNING id, frase, autor, ativa
      `,
      [
        frase.trim(),
        autor.trim()
      ]
    );

    res.status(201).json({
      sucesso: true,
      mensagem: "Frase cadastrada com sucesso!",
      frase: resultado.rows[0]
    });

  } catch (erro) {

    console.error("❌ ERRO AO CADASTRAR FRASE:");
    console.error(erro);

    res.status(500).json({
      sucesso: false,
      erro: "Erro ao cadastrar frase motivacional.",
      detalhe: erro.message
    });
  }
});


// ---------- EDITAR FRASE ----------
app.put("/api/admin/frases/:id", async (req, res) => {

  const id = parseInt(req.params.id, 10);
  const { frase, autor } = req.body;

  if (isNaN(id)) {
    return res.status(400).json({
      sucesso: false,
      erro: "ID inválido."
    });
  }

  if (!frase || !autor) {
    return res.status(400).json({
      sucesso: false,
      erro: "Informe a frase e o autor."
    });
  }

  try {

    const resultado = await pool.query(
      `
      UPDATE frase_motivacional
      SET
        frase = $1,
        autor = $2
      WHERE id = $3
      RETURNING id, frase, autor, ativa
      `,
      [
        frase.trim(),
        autor.trim(),
        id
      ]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({
        sucesso: false,
        erro: "Frase não encontrada."
      });
    }

    res.json({
      sucesso: true,
      mensagem: "Frase atualizada com sucesso!",
      frase: resultado.rows[0]
    });

  } catch (erro) {

    console.error("❌ ERRO AO EDITAR FRASE:");
    console.error(erro);

    res.status(500).json({
      sucesso: false,
      erro: "Erro ao editar frase motivacional.",
      detalhe: erro.message
    });
  }
});


// ---------- EXCLUIR FRASE ----------
app.delete("/api/admin/frases/:id", async (req, res) => {

  const id = parseInt(req.params.id, 10);

  if (isNaN(id)) {
    return res.status(400).json({
      sucesso: false,
      erro: "ID inválido."
    });
  }

  try {

    const resultado = await pool.query(
      `
      DELETE FROM frase_motivacional
      WHERE id = $1
      RETURNING id
      `,
      [id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({
        sucesso: false,
        erro: "Frase não encontrada."
      });
    }

    res.json({
      sucesso: true,
      mensagem: "Frase excluída com sucesso!"
    });

  } catch (erro) {

    console.error("❌ ERRO AO EXCLUIR FRASE:");
    console.error(erro);

    res.status(500).json({
      sucesso: false,
      erro: "Erro ao excluir frase motivacional.",
      detalhe: erro.message
    });
  }
});

// ============================================================
// EQUIPE DO SISTEMA - VALIDAR CÓDIGO DE SEGURANÇA
// ============================================================

app.post("/api/equipe/validar-codigo", async (req, res) => {

    try {

        const codigo = String(req.body.codigo || '').trim();


        // ----------------------------------------------------
        // 1. VALIDAR FORMATO
        // ----------------------------------------------------

        if (!/^\d{6}$/.test(codigo)) {

            return res.status(400).json({
                sucesso: false,
                erro: "O código deve possuir exatamente 6 números."
            });

        }


        // ----------------------------------------------------
        // 2. BUSCAR SOMENTE INTEGRANTES ATIVOS
        // ----------------------------------------------------

        const resultado = await pool.query(`
            SELECT
                id,
                nome,
                equipe,
                codigo_hash
            FROM equipe_sistema
            WHERE ativo = TRUE
        `);


        // ----------------------------------------------------
        // 3. COMPARAR O CÓDIGO COM OS HASHES
        // ----------------------------------------------------

        let integranteEncontrado = null;


        for (const integrante of resultado.rows) {

            const codigoCorreto = await bcrypt.compare(
                codigo,
                integrante.codigo_hash
            );


            if (codigoCorreto) {

                integranteEncontrado = integrante;

                break;

            }

        }


        // ----------------------------------------------------
        // 4. CÓDIGO NÃO ENCONTRADO
        // ----------------------------------------------------

        if (!integranteEncontrado) {

            return res.status(401).json({
                sucesso: false,
                erro: "Código de segurança inválido."
            });

        }


        // ----------------------------------------------------
        // 5. CÓDIGO CORRETO
        // ----------------------------------------------------

        return res.json({

            sucesso: true,

            integrante: {
                id: integranteEncontrado.id,
                nome: integranteEncontrado.nome,
                equipe: integranteEncontrado.equipe
            }

        });


    } catch (erro) {

        console.error(
            "❌ Erro ao validar código da equipe:",
            erro
        );


        return res.status(500).json({
            sucesso: false,
            erro: "Erro interno ao validar o código de segurança."
        });

    }

});

// =====================================================
// CADASTRAR VALIDAÇÃO OU ERRO
// =====================================================

app.post("/api/validacoes-erros", async (req, res) => {

    try {

        const {
            tipo,
            descricao,
            importancia,
            inserido_por
        } = req.body;


        // Validação dos campos obrigatórios
        if (!tipo || !descricao || !importancia || !inserido_por) {
            return res.status(400).json({
                erro: "Todos os campos são obrigatórios."
            });
        }


        // Aceita somente os dois tipos previstos
        if (!["validacao", "erro"].includes(tipo)) {
            return res.status(400).json({
                erro: "Tipo de registro inválido."
            });
        }


        // Aceita somente os graus previstos
        if (!["baixa", "media", "alta", "critica"].includes(importancia)) {
            return res.status(400).json({
                erro: "Grau de importância inválido."
            });
        }


        const resultado = await pool.query(
            `
            INSERT INTO validacoes_erros
                (
                    tipo,
                    descricao,
                    importancia,
                    inserido_por
                )
            VALUES ($1, $2, $3, $4)

            RETURNING
                id,
                tipo,
                descricao,
                importancia,
                inserido_por,
                criado_em,
                resolvido
            `,
            [
                tipo,
                descricao.trim(),
                importancia,
                inserido_por
            ]
        );


        console.log(
            "✅ Validação/erro cadastrado:",
            resultado.rows[0]
        );


        return res.status(201).json({
            mensagem: "Registro cadastrado com sucesso.",
            registro: resultado.rows[0]
        });


    } catch (erro) {

        console.error(
            "❌ Erro ao cadastrar validação/erro:",
            erro
        );


        return res.status(500).json({
            erro: "Não foi possível cadastrar o registro."
        });

    }

});


// =====================================================
// MARCAR VALIDAÇÃO / ERRO COMO RESOLVIDO
// =====================================================

app.put("/api/validacoes-erros/:id/resolver", async (req, res) => {

    try {

        const id = Number(req.params.id);
        const { codigo } = req.body;


        // ID válido
        if (!Number.isInteger(id) || id <= 0) {

            return res.status(400).json({
                sucesso: false,
                erro: "Registro inválido."
            });

        }


        // Código com 6 dígitos
        if (!/^\d{6}$/.test(String(codigo || ""))) {

            return res.status(400).json({
                sucesso: false,
                erro: "Informe um código de segurança válido."
            });

        }


        // Busca integrantes ativos
        const resultadoEquipe = await pool.query(`
            SELECT
                id,
                nome,
                equipe,
                codigo_hash
            FROM equipe_sistema
            WHERE ativo = TRUE
            ORDER BY id
        `);


        let integranteIdentificado = null;


        // Compara o código informado com os hashes
        for (const integrante of resultadoEquipe.rows) {

            const codigoValido = await bcrypt.compare(
                String(codigo),
                integrante.codigo_hash
            );


            if (codigoValido) {

                integranteIdentificado = integrante;
                break;

            }

        }


        // Código não pertence a ninguém
        if (!integranteIdentificado) {

            return res.status(401).json({
                sucesso: false,
                erro: "Código de segurança inválido."
            });

        }


        // Marca como resolvido
        const resultado = await pool.query(
            `
            UPDATE validacoes_erros

            SET
                resolvido = TRUE,
                resolvido_em = CURRENT_TIMESTAMP,
                resolvido_por = $1,
                atualizado_em = CURRENT_TIMESTAMP

            WHERE id = $2
              AND resolvido = FALSE

            RETURNING
                id,
                tipo,
                descricao,
                importancia,
                resolvido,
                resolvido_em,
                resolvido_por
            `,
            [
                integranteIdentificado.id,
                id
            ]
        );


        if (resultado.rowCount === 0) {

            return res.status(404).json({
                sucesso: false,
                erro: "Registro não encontrado ou já marcado como resolvido."
            });

        }


        console.log(
            "🔧 Registro marcado como resolvido:",
            resultado.rows[0]
        );


        return res.json({

            sucesso: true,

            mensagem:
                "Registro marcado como resolvido com sucesso.",

            registro:
                resultado.rows[0],

            integrante: {
                id: integranteIdentificado.id,
                nome: integranteIdentificado.nome,
                equipe: integranteIdentificado.equipe
            }

        });


    } catch (erro) {

        console.error(
            "❌ Erro ao marcar registro como resolvido:",
            erro
        );


        return res.status(500).json({
            sucesso: false,
            erro: "Não foi possível concluir o registro."
        });

    }

});

// =====================================================
// LISTAR VALIDAÇÕES E ERROS
// =====================================================

app.get("/api/validacoes-erros", async (req, res) => {

    try {

        const resultado = await pool.query(`
            SELECT
                ve.id,
                ve.tipo,
                ve.descricao,
                ve.importancia,
                ve.criado_em,
                ve.resolvido,
                ve.resolvido_em,

                inseridor.nome AS inserido_por_nome,
                inseridor.equipe AS inserido_por_equipe,

                resolvedor.nome AS resolvido_por_nome,
                resolvedor.equipe AS resolvido_por_equipe

            FROM validacoes_erros ve

            INNER JOIN equipe_sistema inseridor
                ON inseridor.id = ve.inserido_por

            LEFT JOIN equipe_sistema resolvedor
                ON resolvedor.id = ve.resolvido_por

            ORDER BY
                ve.resolvido ASC,
                ve.criado_em DESC
        `);


        return res.json({
            sucesso: true,
            registros: resultado.rows
        });


    } catch (erro) {

        console.error(
            "❌ Erro ao carregar validações e erros:",
            erro
        );


        return res.status(500).json({
            sucesso: false,
            erro: "Não foi possível carregar as validações e erros."
        });

    }

});

// =====================================================
// EXCLUIR VALIDAÇÃO OU ERRO
// =====================================================

app.delete("/api/validacoes-erros/:id", async (req, res) => {

    try {

        const id = Number(req.params.id);

        // Verifica se o ID é válido
        if (!Number.isInteger(id) || id <= 0) {

            return res.status(400).json({
                sucesso: false,
                erro: "Registro inválido."
            });

        }


        const resultado = await pool.query(
            `
            DELETE FROM validacoes_erros
            WHERE id = $1
            RETURNING id, tipo, descricao
            `,
            [id]
        );


        // Nenhum registro encontrado
        if (resultado.rowCount === 0) {

            return res.status(404).json({
                sucesso: false,
                erro: "Registro não encontrado."
            });

        }


        console.log(
            "🗑️ Validação/erro excluído:",
            resultado.rows[0]
        );


        return res.json({
            sucesso: true,
            mensagem: "Registro excluído com sucesso.",
            registro: resultado.rows[0]
        });


    } catch (erro) {

        console.error(
            "❌ Erro ao excluir validação/erro:",
            erro
        );


        return res.status(500).json({
            sucesso: false,
            erro: "Não foi possível excluir o registro."
        });

    }

});

// =====================================================
// ALTERAR VALIDAÇÃO OU ERRO
// =====================================================

app.put("/api/validacoes-erros/:id", async (req, res) => {

    try {

        const id = Number(req.params.id);

        const {
            descricao,
            importancia
        } = req.body;


        // ID inválido
        if (!Number.isInteger(id) || id <= 0) {

            return res.status(400).json({
                sucesso: false,
                erro: "Registro inválido."
            });

        }


        // Campos obrigatórios
        if (!descricao || !descricao.trim() || !importancia) {

            return res.status(400).json({
                sucesso: false,
                erro: "Descrição e grau de importância são obrigatórios."
            });

        }


        // Importâncias permitidas
        if (!["baixa", "media", "alta", "critica"].includes(importancia)) {

            return res.status(400).json({
                sucesso: false,
                erro: "Grau de importância inválido."
            });

        }


        const resultado = await pool.query(
            `
            UPDATE validacoes_erros

            SET
                descricao = $1,
                importancia = $2,
                atualizado_em = CURRENT_TIMESTAMP

            WHERE id = $3

            RETURNING
                id,
                tipo,
                descricao,
                importancia,
                criado_em,
                atualizado_em
            `,
            [
                descricao.trim(),
                importancia,
                id
            ]
        );


        if (resultado.rowCount === 0) {

            return res.status(404).json({
                sucesso: false,
                erro: "Registro não encontrado."
            });

        }


        console.log(
            "✏️ Validação/erro alterado:",
            resultado.rows[0]
        );


        return res.json({
            sucesso: true,
            mensagem: "Registro alterado com sucesso.",
            registro: resultado.rows[0]
        });


    } catch (erro) {

        console.error(
            "❌ Erro ao alterar validação/erro:",
            erro
        );


        return res.status(500).json({
            sucesso: false,
            erro: "Não foi possível alterar o registro."
        });

    }

});

// =====================================================
// PLANO DE ESTUDO - OBJETIVOS PERMITIDOS
// =====================================================

const OBJETIVOS_PLANO_ESTUDO = new Set([
    "organizar_rotina",
    "melhorar_desempenho",
    "recuperar_dificuldades",
    "preparar_provas",
    "enem_vestibular",
    "criar_habito",
    "aprofundar_conhecimentos",
    "outro"
]);

// =====================================================
// PLANO DE ESTUDO - TIPOS DE PLANEJAMENTO
// =====================================================

const TIPOS_PLANEJAMENTO =
    new Set([
        "semanal",
        "mensal"
    ]);


// =====================================================
// PLANO DE ESTUDO - VERIFICAR PREPARAÇÃO
// =====================================================

app.get(
    "/api/plano-estudo/preparacao/:usuarioId",
    async (req, res) => {

        const usuarioId =
            parseInt(req.params.usuarioId, 10);


        if (
            !Number.isInteger(usuarioId) ||
            usuarioId <= 0
        ) {

            return res.status(400).json({
                sucesso: false,
                erro: "ID de usuário inválido."
            });

        }


        try {

            // ==========================================
            // CONFIRMA QUE O USUÁRIO EXISTE
            // ==========================================

            const usuario = await pool.query(
                `
                SELECT id
                FROM usuario
                WHERE id = $1
                `,
                [usuarioId]
            );


            if (usuario.rows.length === 0) {

                return res.status(404).json({
                    sucesso: false,
                    erro: "Usuário não encontrado."
                });

            }


            // ==========================================
            // VERIFICA ROTINA E PERFIL
            // ==========================================

            const status = await pool.query(
                `
                SELECT

                    EXISTS (
                        SELECT 1
                        FROM rotina r
                        WHERE r.usuario_id = $1
                          AND r.ativa = TRUE
                    )
                    AS rotina_preenchida,


                    EXISTS (
                        SELECT 1
                        FROM perfil_tempo_estudo pte
                        WHERE pte.usuario_id = $1
                    )
                    AS perfil_academico_preenchido

                `,
                [usuarioId]
            );


            // ==========================================
            // OBJETIVO JÁ SALVO
            // ==========================================

            const objetivoResultado =
                await pool.query(
                    `
                    SELECT
                        objetivo,
                        objetivo_outro,
                        tipo_planejamento

                    FROM plano_estudo_objetivo

                    WHERE usuario_id = $1
                    `,
                    [usuarioId]
                );


            const objetivoSalvo =
                objetivoResultado.rows[0] || null;


            const rotinaPreenchida =
                Boolean(
                    status.rows[0].rotina_preenchida
                );


            const perfilAcademicoPreenchido =
                Boolean(
                    status.rows[0]
                        .perfil_academico_preenchido
                );


            return res.json({

                sucesso: true,

                rotinaPreenchida,

                perfilAcademicoPreenchido,

                objetivo:
                    objetivoSalvo?.objetivo || "",

                objetivoOutro:
                objetivoSalvo?.objetivo_outro || "",
                    tipoPlanejamento:
                objetivoSalvo?.tipo_planejamento || "",
                    objetivoPreenchido:
                        Boolean(
                            objetivoSalvo?.objetivo
                        ),
                    tipoPlanejamentoPreenchido:
                TIPOS_PLANEJAMENTO.has(
                objetivoSalvo?.tipo_planejamento
                ),

podeGerar:
    rotinaPreenchida &&
    perfilAcademicoPreenchido &&
    Boolean(
        objetivoSalvo?.objetivo
    ) &&
    TIPOS_PLANEJAMENTO.has(
        objetivoSalvo?.tipo_planejamento
    )

            });


        } catch (erro) {

            console.error(
                "❌ Erro ao verificar preparação do plano:",
                erro
            );


            return res.status(500).json({
                sucesso: false,
                erro:
                    "Não foi possível verificar os dados do Plano de Estudo."
            });

        }

    }
);


// =====================================================
// PLANO DE ESTUDO - MONTAR PAYLOAD PARA IA
// =====================================================

async function montarPayloadPlanoEstudo(usuarioId) {

    // ==========================================
    // 1. PERFIL ACADÊMICO
    // ==========================================

    const perfilResultado =
        await pool.query(
            `
            SELECT

                pa.serie,
                pa.etapa_atual,
                pa.rede_ensino,

                pa.curso_desejado,
                pa.universidade_desejada,
                pa.tipo_universidade,

                pa.objetivo_geral,

                pa.trilha_sesi,
                pa.etapa_sesi,

                pa.nao_estuda_nenhuma,
                pa.motivo_nao_estuda,

                disciplina_nao_estuda.nome
                    AS disciplina_nao_estuda

            FROM perfil_academico pa

            LEFT JOIN disciplina
                AS disciplina_nao_estuda

                ON disciplina_nao_estuda.id =
                    pa.disciplina_nao_estuda_id

            WHERE pa.usuario_id = $1
            `,
            [usuarioId]
        );


    if (perfilResultado.rows.length === 0) {

        const erro =
            new Error(
                "Perfil Acadêmico não encontrado."
            );

        erro.status = 404;

        throw erro;

    }


    // ==========================================
    // 2. DIFICULDADES
    // ==========================================

    const dificuldadesResultado =
        await pool.query(
            `
            SELECT

                d.nome AS disciplina,

                pd.conteudo_1,
                pd.conteudo_2,
                pd.conteudo_3

            FROM perfil_dificuldade pd

            INNER JOIN disciplina d
                ON d.id = pd.disciplina_id

            WHERE pd.usuario_id = $1

            ORDER BY d.nome
            `,
            [usuarioId]
        );


    // ==========================================
    // 3. TEMPO DISPONÍVEL
    // ==========================================

    const tempoResultado =
        await pool.query(
            `
            SELECT

                tempo_atual_minutos,
                dias_disponiveis,
                periodo_preferido,
                tempo_disponivel_minutos,
                fim_semana,
                periodo_livre

            FROM perfil_tempo_estudo

            WHERE usuario_id = $1
            `,
            [usuarioId]
        );


    if (tempoResultado.rows.length === 0) {

        const erro =
            new Error(
                "Tempo disponível para estudos não encontrado."
            );

        erro.status = 400;

        throw erro;

    }


    // ==========================================
    // 4. OBJETIVO DO PLANO
    // ==========================================

    const objetivoResultado =
        await pool.query(
            `
            SELECT

                objetivo,
                objetivo_outro,
                tipo_planejamento

            FROM plano_estudo_objetivo

            WHERE usuario_id = $1
            `,
            [usuarioId]
        );


    if (objetivoResultado.rows.length === 0) {

        const erro =
            new Error(
                "Objetivo do Plano de Estudo não encontrado."
            );

        erro.status = 400;

        throw erro;

    }


    // ==========================================
    // 5. ROTINA ATIVA
    // ==========================================

    const rotinaResultado =
        await pool.query(
            `
            SELECT

                id,
                preferencia_periodo,
                duracao_bloco_min,
                intervalo_min,
                rotina_variavel

            FROM rotina

            WHERE usuario_id = $1
              AND ativa = TRUE

            ORDER BY
                atualizada_em DESC,
                criada_em DESC

            LIMIT 1
            `,
            [usuarioId]
        );


    if (rotinaResultado.rows.length === 0) {

        const erro =
            new Error(
                "Rotina Diária não encontrada."
            );

        erro.status = 400;

        throw erro;

    }


    const rotinaBase =
        rotinaResultado.rows[0];


    const itensResultado =
        await pool.query(
            `
            SELECT

                dia_semana,
                hora_inicio,
                hora_fim,
                tipo_atividade,
                descricao,
                tempo_deslocamento_min,
                fixo,
                bloqueia_estudo

            FROM rotina_item

            WHERE rotina_id = $1

            ORDER BY
                dia_semana ASC,
                hora_inicio ASC
            `,
            [rotinaBase.id]
        );


    // ==========================================
    // 6. PAYLOAD FINAL
    // ==========================================

    return {

        perfil:
            perfilResultado.rows[0],

        dificuldades:
            dificuldadesResultado.rows,

        tempoEstudo:
            tempoResultado.rows[0],

        tipoPlanejamento:
            objetivoResultado.rows[0].tipo_planejamento,

        objetivoPlano:
            objetivoResultado.rows[0],

        rotina: {

            preferenciaPeriodo:
                rotinaBase.preferencia_periodo,

            duracaoBlocoMin:
                rotinaBase.duracao_bloco_min,

            intervaloMin:
                rotinaBase.intervalo_min,

            rotinaVariavel:
                rotinaBase.rotina_variavel,

            compromissos:
                itensResultado.rows

        }

    };

}


// =====================================================
// PLANO DE ESTUDO - VISUALIZAR PAYLOAD
// DIAGNÓSTICO - NÃO CHAMA IA
// =====================================================

app.get(
    "/api/plano-estudo/payload/:usuarioId",
    async (req, res) => {

        const usuarioId =
            parseInt(req.params.usuarioId, 10);


        if (
            !Number.isInteger(usuarioId) ||
            usuarioId <= 0
        ) {

            return res.status(400).json({
                sucesso: false,
                erro: "ID de usuário inválido."
            });

        }


        try {

            const payload =
                await montarPayloadPlanoEstudo(
                    usuarioId
                );


            return res.json({

                sucesso: true,

                payload

            });


        } catch (erro) {

            console.error(
                "❌ Erro ao montar payload:",
                erro
            );


            return res
                .status(erro.status || 500)
                .json({

                    sucesso: false,

                    erro:
                        erro.message ||
                        "Não foi possível montar o payload."

                });

        }

    }
);


// =====================================================
// PLANO DE ESTUDO - CONFIGURAÇÃO DO JSON DA IA
// =====================================================

const NOMES_DIAS_PLANO = {

    1: "Segunda-feira",
    2: "Terça-feira",
    3: "Quarta-feira",
    4: "Quinta-feira",
    5: "Sexta-feira",
    6: "Sábado",
    7: "Domingo"

};


const DIAS_DISPONIVEIS_PLANO = {

    "Seg": 1,
    "Ter": 2,
    "Qua": 3,
    "Qui": 4,
    "Sex": 5,
    "Sáb": 6,
    "Sab": 6,
    "Dom": 7

};

// =====================================================
// PLANO DE ESTUDO - MONTAR PROMPT PARA O CLAUDE
// =====================================================

function montarPromptPlanoEstudo(payload) {

    const formatoResposta = {

        versao: 1,

        resumo:
            "Breve explicação do plano criado.",

        sessoes: [

            {
                diaSemana: 1,
                dia: "Segunda-feira",
                horaInicio: "19:00",
                horaFim: "19:45",
                disciplina: "Matemática",
                conteudo: "Equações do 1º grau",
                atividade:
                    "Revisar conceitos e resolver exercícios.",
                duracaoMin: 45,
                prioridade: "alta"
            }

        ],

        observacoes: [
            "Orientação curta para o estudante."
        ]

    };


    return `
Você é um orientador pedagógico especializado em planejamento de estudos.

Sua tarefa é criar um plano semanal REALISTA para um estudante.

IMPORTANTE:
- Utilize somente as informações fornecidas.
- Não invente compromissos, dificuldades ou dados acadêmicos.
- Nunca coloque sessão de estudo em horário ocupado pela rotina.
- Compromissos com bloqueia_estudo=true impedem totalmente o uso daquele horário.
- Utilize somente os dias que o estudante informou como disponíveis.
- Respeite o tempo_disponivel_minutos por dia.
- Priorize disciplinas e conteúdos indicados como dificuldade.
- Considere a disciplina que o estudante praticamente não estuda, quando houver.
- Considere o período do dia em que o estudante afirma render melhor.
- O plano precisa ser sustentável, não excessivo.
- Prefira sessões entre 25 e 90 minutos.
- Evite horários incompatíveis com os compromissos cadastrados.
- diaSemana usa obrigatoriamente:
  1 = Segunda-feira
  2 = Terça-feira
  3 = Quarta-feira
  4 = Quinta-feira
  5 = Sexta-feira
  6 = Sábado
  7 = Domingo
- horaInicio e horaFim devem usar HH:MM no formato 24 horas.
- duracaoMin deve corresponder exatamente à diferença entre horaInicio e horaFim.
- prioridade deve ser apenas "alta", "media" ou "normal".

DADOS DO ESTUDANTE:

${JSON.stringify(payload, null, 2)}

FORMATO OBRIGATÓRIO DA RESPOSTA:

${JSON.stringify(formatoResposta, null, 2)}

Responda SOMENTE com JSON válido.

Não use markdown.
Não use blocos de código.
Não escreva nenhuma explicação antes ou depois do JSON.
`;

}


// =====================================================
// PLANO DE ESTUDO - UTILITÁRIOS DE HORÁRIO
// =====================================================

function converterHoraParaMinutos(hora) {

    if (
        typeof hora !== "string" ||
        !/^\d{2}:\d{2}/.test(hora)
    ) {
        return null;
    }


    const partes =
        hora.substring(0, 5)
            .split(":")
            .map(Number);


    const horas = partes[0];
    const minutos = partes[1];


    if (
        horas < 0 ||
        horas > 23 ||
        minutos < 0 ||
        minutos > 59
    ) {
        return null;
    }


    return horas * 60 + minutos;

}


// =====================================================
// PLANO DE ESTUDO - VALIDAR JSON GERADO
// =====================================================

function validarPlanoGerado(
    plano,
    payload
) {

    if (
        !plano ||
        typeof plano !== "object" ||
        Array.isArray(plano)
    ) {

        throw new Error(
            "A IA não retornou um objeto JSON válido."
        );

    }


    if (
        plano.versao !== 1
    ) {

        throw new Error(
            "Versão do plano inválida."
        );

    }


    if (
        typeof plano.resumo !== "string" ||
        !plano.resumo.trim()
    ) {

        throw new Error(
            "O plano não possui resumo válido."
        );

    }


    if (
        !Array.isArray(plano.sessoes) ||
        plano.sessoes.length === 0
    ) {

        throw new Error(
            "O plano não possui sessões de estudo."
        );

    }


    if (
        plano.sessoes.length > 50
    ) {

        throw new Error(
            "O plano possui sessões demais."
        );

    }


    const diasDisponiveis =
        new Set(
            (
                payload.tempoEstudo
                    .dias_disponiveis || []
            )
                .map(
                    dia =>
                        DIAS_DISPONIVEIS_PLANO[
                            dia
                        ]
                )
                .filter(Boolean)
        );


    const limiteDiario =
        Number(
            payload.tempoEstudo
                .tempo_disponivel_minutos
        );


    const minutosPorDia = {};


    plano.sessoes.forEach(
        (sessao, indice) => {

            const numero =
                indice + 1;


            if (
                !Number.isInteger(
                    sessao.diaSemana
                ) ||
                sessao.diaSemana < 1 ||
                sessao.diaSemana > 7
            ) {

                throw new Error(
                    `Sessão ${numero}: diaSemana inválido.`
                );

            }


            if (
                sessao.dia !==
                NOMES_DIAS_PLANO[
                    sessao.diaSemana
                ]
            ) {

                throw new Error(
                    `Sessão ${numero}: nome do dia incompatível.`
                );

            }


            if (
                diasDisponiveis.size > 0 &&
                !diasDisponiveis.has(
                    sessao.diaSemana
                )
            ) {

                throw new Error(
                    `Sessão ${numero}: dia não informado como disponível pelo estudante.`
                );

            }


            const inicio =
                converterHoraParaMinutos(
                    sessao.horaInicio
                );


            const fim =
                converterHoraParaMinutos(
                    sessao.horaFim
                );


            if (
                inicio === null ||
                fim === null ||
                fim <= inicio
            ) {

                throw new Error(
                    `Sessão ${numero}: horário inválido.`
                );

            }


            const duracaoCalculada =
                fim - inicio;


            if (
                !Number.isInteger(
                    sessao.duracaoMin
                ) ||
                sessao.duracaoMin !==
                    duracaoCalculada
            ) {

                throw new Error(
                    `Sessão ${numero}: duração incompatível com o horário.`
                );

            }


            if (
                sessao.duracaoMin < 15 ||
                sessao.duracaoMin > 180
            ) {

                throw new Error(
                    `Sessão ${numero}: duração fora do limite permitido.`
                );

            }


            [
                "disciplina",
                "conteudo",
                "atividade"
            ].forEach(campo => {

                if (
                    typeof sessao[campo] !==
                        "string" ||
                    !sessao[campo].trim()
                ) {

                    throw new Error(
                        `Sessão ${numero}: campo ${campo} inválido.`
                    );

                }

            });


            if (
                ![
                    "alta",
                    "media",
                    "normal"
                ].includes(
                    sessao.prioridade
                )
            ) {

                throw new Error(
                    `Sessão ${numero}: prioridade inválida.`
                );

            }


            // ==========================================
            // VERIFICAR CONFLITO COM A ROTINA
            // ==========================================

            const compromissos =
                payload.rotina
                    ?.compromissos || [];


            compromissos
                .filter(
                    compromisso =>
                        Number(
                            compromisso.dia_semana
                        ) ===
                            sessao.diaSemana &&
                        compromisso
                            .bloqueia_estudo
                )
                .forEach(
                    compromisso => {

                        const inicioCompromisso =
                            converterHoraParaMinutos(
                                compromisso
                                    .hora_inicio
                            );


                        const fimCompromisso =
                            converterHoraParaMinutos(
                                compromisso
                                    .hora_fim
                            );


                        if (
                            inicioCompromisso ===
                                null ||
                            fimCompromisso ===
                                null
                        ) {
                            return;
                        }


                        const existeConflito =
                            inicio <
                                fimCompromisso &&
                            fim >
                                inicioCompromisso;


                        if (existeConflito) {

                            throw new Error(
                                `Sessão ${numero}: conflito com compromisso da Rotina Diária.`
                            );

                        }

                    }
                );


            minutosPorDia[
                sessao.diaSemana
            ] =
                (
                    minutosPorDia[
                        sessao.diaSemana
                    ] || 0
                ) +
                sessao.duracaoMin;

        }
    );


    if (
        Number.isFinite(limiteDiario) &&
        limiteDiario > 0
    ) {

        Object.entries(
            minutosPorDia
        ).forEach(
            ([dia, minutos]) => {

                if (
                    minutos >
                    limiteDiario
                ) {

                    throw new Error(
                        `O plano ultrapassa o tempo diário disponível em ${NOMES_DIAS_PLANO[dia]}.`
                    );

                }

            }
        );

    }


    if (
        !Array.isArray(
            plano.observacoes
        )
    ) {

        plano.observacoes = [];

    }


    return plano;

}

// =====================================================
// PLANO DE ESTUDO - GERAR COM CLAUDE
// TESTE REAL - AINDA NÃO SALVA NO BANCO
// =====================================================

app.post(
    "/api/plano-estudo/claude/:usuarioId",
    async (req, res) => {

        const usuarioId =
            parseInt(
                req.params.usuarioId,
                10
            );


        if (
            !Number.isInteger(usuarioId) ||
            usuarioId <= 0
        ) {

            return res.status(400).json({

                sucesso: false,

                erro:
                    "ID de usuário inválido."

            });

        }


        if (
            !process.env
                .ANTHROPIC_API_KEY
        ) {

            return res.status(500).json({

                sucesso: false,

                erro:
                    "ANTHROPIC_API_KEY não configurada."

            });

        }


        try {

            // ==========================================
            // 1. BUSCAR DADOS REAIS DO ALUNO
            // ==========================================

            const payload =
                await montarPayloadPlanoEstudo(
                    usuarioId
                );


            // ==========================================
            // 2. MONTAR PROMPT
            // ==========================================

            const prompt =
                montarPromptPlanoEstudo(
                    payload
                );


            // ==========================================
            // 3. CHAMAR CLAUDE
            // ==========================================

            const respostaClaude =
                await anthropic.messages.create({

                    model:
                        "claude-sonnet-4-6",

                    max_tokens:
                        3000,

                    temperature:
                        0.2,

                    messages: [

                        {
                            role: "user",
                            content: prompt
                        }

                    ]

                });


            // ==========================================
            // 4. EXTRAIR TEXTO
            // ==========================================

            const textoResposta =
                respostaClaude.content

                    .filter(
                        bloco =>
                            bloco.type ===
                            "text"
                    )

                    .map(
                        bloco =>
                            bloco.text
                    )

                    .join("\n")

                    .trim();


            if (!textoResposta) {

                throw new Error(
                    "Claude não retornou conteúdo."
                );

            }


            // ==========================================
            // 5. LIMPAR EVENTUAL MARKDOWN
            // ==========================================

            const textoLimpo =
                textoResposta

                    .replace(
                        /^```json\s*/i,
                        ""
                    )

                    .replace(
                        /^```\s*/i,
                        ""
                    )

                    .replace(
                        /\s*```$/,
                        ""
                    )

                    .trim();


            // ==========================================
            // 6. CONVERTER PARA JSON
            // ==========================================

            let plano;


            try {

                plano =
                    JSON.parse(
                        textoLimpo
                    );

            } catch (erroJson) {

                console.error(
                    "❌ JSON inválido retornado pelo Claude:",
                    textoLimpo
                );


                return res
                    .status(502)
                    .json({

                        sucesso: false,

                        erro:
                            "Claude respondeu, mas o JSON retornado é inválido."

                    });

            }


            // ==========================================
            // 7. VALIDAR PLANO
            // ==========================================

            const planoValidado =
                validarPlanoGerado(
                    plano,
                    payload
                );


            // ==========================================
            // 8. RETORNAR
            // NÃO SALVA NADA AINDA
            // ==========================================

            return res.json({

                sucesso: true,

                modelo:
                    respostaClaude.model,

                uso: {

                    tokensEntrada:
                        respostaClaude
                            .usage
                            ?.input_tokens ||
                        null,

                    tokensSaida:
                        respostaClaude
                            .usage
                            ?.output_tokens ||
                        null

                },

                plano:
                    planoValidado

            });


        } catch (erro) {

            console.error(
                "❌ Erro ao gerar Plano de Estudo com Claude:",
                {
                    status:
                        erro.status,

                    mensagem:
                        erro.message
                }
            );


            return res
                .status(
                    erro.status &&
                    Number.isInteger(
                        erro.status
                    )
                        ? erro.status
                        : 500
                )
                .json({

                    sucesso: false,

                    erro:
                        erro.message ||
                        "Não foi possível gerar o Plano de Estudo."

                });

        }

    }
);


// =====================================================
// PLANO DE ESTUDO - GERAR
// POR ENQUANTO FUNCIONA EM MODO DE TESTE
// =====================================================

app.post(
    "/api/plano-estudo/gerar/:usuarioId",
    async (req, res) => {

        const usuarioId =
            parseInt(req.params.usuarioId, 10);


        const {
            objetivo,
            objetivoOutro,
            tipoPlanejamento
        } = req.body;


        // ==========================================
        // VALIDAR USUÁRIO
        // ==========================================

        if (
            !Number.isInteger(usuarioId) ||
            usuarioId <= 0
        ) {

            return res.status(400).json({
                sucesso: false,
                erro: "ID de usuário inválido."
            });

        }


        // ==========================================
        // VALIDAR OBJETIVO
        // ==========================================

        if (
            !objetivo ||
            !OBJETIVOS_PLANO_ESTUDO.has(objetivo)
        ) {

            return res.status(400).json({
                sucesso: false,
                erro:
                    "Selecione um objetivo válido para o Plano de Estudo."
            });

        }


        if (
            objetivo === "outro" &&
            !String(objetivoOutro || "").trim()
        ) {

            return res.status(400).json({
                sucesso: false,
                erro:
                    "Informe qual é o seu objetivo."
            });

        }

        // ==========================================
// VALIDAR TIPO DE PLANEJAMENTO
// ==========================================

if (
    !TIPOS_PLANEJAMENTO.has(
        tipoPlanejamento
    )
) {

    return res.status(400).json({

        sucesso: false,

        erro:
            "Escolha se deseja um planejamento semanal ou mensal."

    });

}

        try {

            // ==========================================
            // CONFIRMA USUÁRIO
            // ==========================================

            const usuario =
                await pool.query(
                    `
                    SELECT id
                    FROM usuario
                    WHERE id = $1
                    `,
                    [usuarioId]
                );


            if (usuario.rows.length === 0) {

                return res.status(404).json({
                    sucesso: false,
                    erro: "Usuário não encontrado."
                });

            }


            // ==========================================
            // VERIFICA PRÉ-REQUISITOS
            // ==========================================

            const status =
                await pool.query(
                    `
                    SELECT

                        EXISTS (
                            SELECT 1
                            FROM rotina r
                            WHERE r.usuario_id = $1
                              AND r.ativa = TRUE
                        )
                        AS rotina_preenchida,


                        EXISTS (
                            SELECT 1
                            FROM perfil_tempo_estudo pte
                            WHERE pte.usuario_id = $1
                        )
                        AS perfil_academico_preenchido

                    `,
                    [usuarioId]
                );


            const rotinaPreenchida =
                Boolean(
                    status.rows[0].rotina_preenchida
                );


            const perfilAcademicoPreenchido =
                Boolean(
                    status.rows[0]
                        .perfil_academico_preenchido
                );


            const faltando = [];


            if (!rotinaPreenchida) {
                faltando.push("Rotina Diária");
            }


            if (!perfilAcademicoPreenchido) {
                faltando.push("Perfil Acadêmico");
            }


            if (faltando.length > 0) {

                return res.status(400).json({

                    sucesso: false,

                    erro:
                        "Existem informações obrigatórias que ainda não foram preenchidas.",

                    faltando

                });

            }


            // ==========================================
            // SALVAR / ATUALIZAR OBJETIVO
            // ==========================================

            const objetivoOutroFinal =
                objetivo === "outro"
                    ? String(objetivoOutro).trim()
                    : null;


            const resultadoObjetivo =
                await pool.query(
                    `
                    INSERT INTO plano_estudo_objetivo
                    (
                        usuario_id,
                        objetivo,
                        objetivo_outro,
                        tipo_planejamento
                    )

                    VALUES ($1, $2, $3, $4)

                    ON CONFLICT (usuario_id)

                    DO UPDATE SET

                        objetivo =
                            EXCLUDED.objetivo,

                        objetivo_outro =
                            EXCLUDED.objetivo_outro,

                        tipo_planejamento =
                            EXCLUDED.tipo_planejamento,

                        atualizado_em =
                            CURRENT_TIMESTAMP

                    RETURNING
                        id,
                        usuario_id,
                        objetivo,
                        objetivo_outro,
                        tipo_planejamento,
                        criado_em,
                        atualizado_em
                    `,
                    [
                        usuarioId,
                        objetivo,
                        objetivoOutroFinal,
                        tipoPlanejamento
                    ]
                );


            console.log(
                "🤖 Dados preparados para geração do plano:",
                {
                    usuarioId,
                    objetivo,
                    tipoPlanejamento
                }
            );


            // ==========================================
            // FUTURAMENTE A API DA IA ENTRARÁ AQUI
            // ==========================================


            return res.json({

                sucesso: true,

                modo: "teste",

                prontoParaIA: true,

                mensagem:
                    "Todos os dados necessários estão prontos para geração do Plano de Estudo.",

                objetivo:
                    resultadoObjetivo.rows[0]

            });


        } catch (erro) {

            console.error(
                "❌ Erro ao preparar Plano de Estudo:",
                erro
            );


            return res.status(500).json({

                sucesso: false,

                erro:
                    "Não foi possível preparar o Plano de Estudo."

            });

        }

    }
);

// =====================================================
// PDF - PLANO DE ESTUDOS
// =====================================================

function formatarDataPdf(data) {

    if (!data) {
        return "-";
    }

    const texto =
        String(data).substring(0, 10);

    const partes =
        texto.split("-");

    if (partes.length !== 3) {
        return texto;
    }

    return `${partes[2]}/${partes[1]}/${partes[0]}`;
}


function nomeArquivoSeguro(texto) {

    return String(texto || "estudante")

        .normalize("NFD")

        .replace(
            /[\u0300-\u036f]/g,
            ""
        )

        .replace(
            /[^a-zA-Z0-9]+/g,
            "-"
        )

        .replace(
            /^-+|-+$/g,
            ""
        )

        .toLowerCase();
}


function gerarBufferPdfPlano(
    plano,
    itens
) {

    return new Promise(
        (resolve, reject) => {

            const doc =
                new PDFDocument({

                    size: "A4",

                    margins: {
                        top: 45,
                        bottom: 50,
                        left: 45,
                        right: 45
                    },

                    bufferPages: true

                });


            const partes = [];


            doc.on(
                "data",
                parte =>
                    partes.push(parte)
            );


            doc.on(
                "error",
                reject
            );


            doc.on(
                "end",
                () => {

                    resolve(
                        Buffer.concat(partes)
                    );

                }
            );


            // ==========================================
            // CABEÇALHO
            // ==========================================

            doc
                .rect(
                    0,
                    0,
                    doc.page.width,
                    115
                )
                .fill("#1e3a8a");


            doc
                .fillColor("#ffffff")
                .font("Helvetica-Bold")
                .fontSize(23)
                .text(
                    "ROTA DO SUCESSO",
                    45,
                    32
                );


            doc
                .font("Helvetica")
                .fontSize(12)
                .text(
                    "Cronograma Personalizado de Estudos",
                    45,
                    68
                );


            doc.y = 140;


            // ==========================================
            // ALUNO
            // ==========================================

            doc
                .fillColor("#0f172a")
                .font("Helvetica-Bold")
                .fontSize(16)
                .text(
                    plano.aluno_nome ||
                    "Estudante"
                );


            doc.moveDown(0.4);


            doc
                .font("Helvetica")
                .fontSize(10)
                .fillColor("#475569");


            if (plano.serie) {

                doc.text(
                    `Série: ${plano.serie}`
                );

            }


            if (plano.escola) {

                doc.text(
                    `Escola: ${plano.escola}`
                );

            }


            if (
                plano.data_inicio ||
                plano.data_fim
            ) {

                doc.text(
                    `Período do plano: ${formatarDataPdf(plano.data_inicio)} a ${formatarDataPdf(plano.data_fim)}`
                );

            }


            doc.moveDown(1);


            doc
                .fillColor("#1e40af")
                .font("Helvetica-Bold")
                .fontSize(14)
                .text(
                    "Cronograma semanal"
                );


            doc.moveDown(0.7);


            // ==========================================
            // SESSÕES
            // ==========================================

            itens.forEach(
                (item, indice) => {

                    if (
                        doc.y >
                        doc.page.height - 180
                    ) {

                        doc.addPage();

                    }


                    const y =
                        doc.y;


                    doc
                        .roundedRect(
                            45,
                            y,
                            doc.page.width - 90,
                            112,
                            8
                        )
                        .fillAndStroke(
                            "#f8fafc",
                            "#dbeafe"
                        );


                    doc
                        .fillColor("#1d4ed8")
                        .font("Helvetica-Bold")
                        .fontSize(11)
                        .text(
                            `${formatarDataPdf(item.data_prevista)}  |  ${item.hora_inicio || "--:--"} - ${item.hora_fim || "--:--"}`,
                            60,
                            y + 14
                        );


                    doc
                        .fillColor("#0f172a")
                        .font("Helvetica-Bold")
                        .fontSize(12)
                        .text(
                            item.disciplina ||
                            "Sessão de estudo",
                            60,
                            y + 38
                        );


                    if (item.conteudo) {

                        doc
                            .font("Helvetica")
                            .fontSize(9)
                            .fillColor("#334155")
                            .text(
                                `Conteúdo: ${item.conteudo}`,
                                60,
                                y + 58,
                                {
                                    width:
                                        doc.page.width -
                                        120
                                }
                            );

                    }


                    doc
                        .font("Helvetica")
                        .fontSize(9)
                        .fillColor("#334155")
                        .text(
                            `Atividade: ${item.atividade || "Estudo programado"}`,
                            60,
                            y + 76,
                            {
                                width:
                                    doc.page.width -
                                    120
                            }
                        );


                    doc
                        .font("Helvetica")
                        .fontSize(8)
                        .fillColor("#64748b")
                        .text(
                            `Duração: ${item.duracao_min || "-"} minutos`,
                            60,
                            y + 96
                        );


                    doc.y =
                        y + 128;

                }
            );


            // ==========================================
            // RODAPÉ
            // ==========================================

            const paginas =
                doc.bufferedPageRange();


            for (
                let i = paginas.start;
                i <
                    paginas.start +
                    paginas.count;
                i++
            ) {

                doc.switchToPage(i);


                doc
                    .font("Helvetica")
                    .fontSize(8)
                    .fillColor("#94a3b8")
                    .text(
                        `Rota do Sucesso | Página ${i + 1} de ${paginas.count}`,
                        45,
                        doc.page.height - 30,
                        {
                            width:
                                doc.page.width -
                                90,
                            align: "center"
                        }
                    );

            }


            doc.end();

        }
    );

}


// =====================================================
// GERAR E SALVAR PDF
// =====================================================

async function gerarESalvarPdfPlano(
    usuarioId,
    planoId
) {

    // ==========================================
    // DADOS PRINCIPAIS DO PLANO
    // ==========================================

    const resultadoPlano =
        await pool.query(
            `
            SELECT

                pe.id,

                pe.usuario_id,

                TO_CHAR(
                    pe.data_inicio,
                    'YYYY-MM-DD'
                ) AS data_inicio,

                TO_CHAR(
                    pe.data_fim,
                    'YYYY-MM-DD'
                ) AS data_fim,

                pe.versao,

                u.nome
                    AS aluno_nome,

                pa.serie,

                pa.escola,

                pa.rede_ensino

            FROM plano_estudo pe

            INNER JOIN usuario u
                ON u.id =
                    pe.usuario_id

            LEFT JOIN perfil_academico pa
                ON pa.usuario_id =
                    pe.usuario_id

            WHERE pe.id = $1
              AND pe.usuario_id = $2
            `,
            [
                planoId,
                usuarioId
            ]
        );


    if (
        resultadoPlano.rows.length === 0
    ) {

        const erro =
            new Error(
                "Plano de Estudo não encontrado."
            );

        erro.status = 404;

        throw erro;

    }


    const plano =
        resultadoPlano.rows[0];


    // ==========================================
    // SESSÕES DO PLANO
    // ==========================================

    const resultadoItens =
        await pool.query(
            `
            SELECT

                pei.id,

                TO_CHAR(
                    pei.data_prevista,
                    'YYYY-MM-DD'
                ) AS data_prevista,

                CASE
                    WHEN pei.hora_inicio IS NULL
                    THEN NULL
                    ELSE TO_CHAR(
                        pei.hora_inicio,
                        'HH24:MI'
                    )
                END AS hora_inicio,

                CASE
                    WHEN pei.hora_fim IS NULL
                    THEN NULL
                    ELSE TO_CHAR(
                        pei.hora_fim,
                        'HH24:MI'
                    )
                END AS hora_fim,

                pei.atividade,

                pei.metodo_estudo,

                pei.duracao_min,

                d.nome
                    AS disciplina,

                cc.titulo
                    AS conteudo

            FROM plano_estudo_item pei

            LEFT JOIN disciplina d
                ON d.id =
                    pei.disciplina_id

            LEFT JOIN conteudo_curricular cc
                ON cc.id =
                    pei.conteudo_curricular_id

            WHERE pei.plano_id = $1

            ORDER BY

                pei.data_prevista ASC
                    NULLS LAST,

                pei.hora_inicio ASC
                    NULLS LAST,

                pei.id ASC
            `,
            [
                planoId
            ]
        );


    if (
        resultadoItens.rows.length === 0
    ) {

        const erro =
            new Error(
                "O plano ainda não possui sessões de estudo."
            );

        erro.status = 400;

        throw erro;

    }


    // ==========================================
    // CRIAR PDF
    // ==========================================

    const pdfBuffer =
        await gerarBufferPdfPlano(
            plano,
            resultadoItens.rows
        );


    // ==========================================
    // HASH DO ARQUIVO
    // ==========================================

    const hash =
        crypto
            .createHash("sha256")
            .update(pdfBuffer)
            .digest("hex");


    const nomeAluno =
        nomeArquivoSeguro(
            plano.aluno_nome
        );


    const nomeArquivo =
        `cronograma-rota-do-sucesso-${nomeAluno}-plano-${planoId}.pdf`;


    // ==========================================
    // SALVAR NO POSTGRESQL
    // ==========================================

    const resultadoPdf =
        await pool.query(
            `
            INSERT INTO plano_estudo_pdf
            (
                plano_id,
                usuario_id,
                nome_arquivo,
                mime_type,
                arquivo_pdf,
                tamanho_bytes,
                hash_sha256,
                versao
            )

            VALUES
            (
                $1,
                $2,
                $3,
                'application/pdf',
                $4,
                $5,
                $6,
                1
            )

            ON CONFLICT (plano_id)

            DO UPDATE SET

                arquivo_pdf =
                    EXCLUDED.arquivo_pdf,

                nome_arquivo =
                    EXCLUDED.nome_arquivo,

                tamanho_bytes =
                    EXCLUDED.tamanho_bytes,

                hash_sha256 =
                    EXCLUDED.hash_sha256,

                versao =
                    plano_estudo_pdf.versao + 1,

                atualizado_em =
                    CURRENT_TIMESTAMP

            RETURNING

                id,
                plano_id,
                nome_arquivo,
                tamanho_bytes,
                versao
            `,
            [
                planoId,
                usuarioId,
                nomeArquivo,
                pdfBuffer,
                pdfBuffer.length,
                hash
            ]
        );


    return resultadoPdf.rows[0];

}

// =====================================================
// GERAR PDF DO PLANO
// =====================================================

app.post(
    "/api/plano-estudo/:usuarioId/:planoId/pdf/gerar",
    async (req, res) => {

        const usuarioId =
            parseInt(
                req.params.usuarioId,
                10
            );

        const planoId =
            parseInt(
                req.params.planoId,
                10
            );


        try {

            const pdf =
                await gerarESalvarPdfPlano(
                    usuarioId,
                    planoId
                );


            return res.json({

                sucesso: true,

                mensagem:
                    "PDF gerado e salvo com sucesso.",

                pdf: {

                    ...pdf,

                    urlDownload:
                        `/api/plano-estudo/${usuarioId}/${planoId}/pdf/download`

                }

            });


        } catch (erro) {

            console.error(
                "Erro ao gerar PDF:",
                erro
            );


            return res
                .status(
                    erro.status || 500
                )
                .json({

                    sucesso: false,

                    erro:
                        erro.message ||
                        "Erro ao gerar PDF."

                });

        }

    }
);

// =====================================================
// LISTAR PLANOS DE ESTUDO DO USUÁRIO
// =====================================================

app.get(
    "/api/plano-estudo/:usuarioId/planos",
    async (req, res) => {

        const usuarioId =
            parseInt(
                req.params.usuarioId,
                10
            );


        if (
            !Number.isInteger(usuarioId) ||
            usuarioId <= 0
        ) {

            return res.status(400).json({

                sucesso: false,

                erro:
                    "ID de usuário inválido."

            });

        }


        try {

            const resultado =
                await pool.query(
                    `
                    SELECT

                        pe.id,

                        pe.tipo_planejamento,

                        TO_CHAR(
                            pe.data_inicio,
                            'DD/MM/YYYY'
                        ) AS data_inicio,

                        TO_CHAR(
                            pe.data_fim,
                            'DD/MM/YYYY'
                        ) AS data_fim,

                        pe.versao,

                        pe.gerado_por_ia,

                        TO_CHAR(
                            pe.criado_em,
                            'DD/MM/YYYY HH24:MI'
                        ) AS criado_em,

                        pdf.id
                            AS pdf_id,

                        pdf.nome_arquivo,

                        pdf.tamanho_bytes,

                        pdf.versao
                            AS pdf_versao

                    FROM plano_estudo pe

                    LEFT JOIN plano_estudo_pdf pdf
                        ON pdf.plano_id =
                            pe.id

                    WHERE pe.usuario_id = $1

                    ORDER BY
                        pe.criado_em DESC,
                        pe.id DESC
                    `,
                    [
                        usuarioId
                    ]
                );


            const planos =
                resultado.rows.map(
                    plano => ({

                        id:
                            plano.id,

                        tipoPlanejamento:
                            plano.tipo_planejamento,

                        dataInicio:
                            plano.data_inicio,

                        dataFim:
                            plano.data_fim,

                        versao:
                            plano.versao,

                        geradoPorIA:
                            plano.gerado_por_ia,

                        criadoEm:
                            plano.criado_em,

                        pdfDisponivel:
                            Boolean(
                                plano.pdf_id
                            ),

                        pdf:
                            plano.pdf_id
                                ? {

                                    id:
                                        plano.pdf_id,

                                    nomeArquivo:
                                        plano.nome_arquivo,

                                    tamanhoBytes:
                                        plano.tamanho_bytes,

                                    versao:
                                        plano.pdf_versao,

                                    urlDownload:
                                        `/api/plano-estudo/${usuarioId}/${plano.id}/pdf/download`

                                }
                                : null

                    })
                );


            return res.json({

                sucesso: true,

                planos

            });


        } catch (erro) {

            console.error(
                "Erro ao listar Planos de Estudo:",
                erro
            );


            return res
                .status(500)
                .json({

                    sucesso: false,

                    erro:
                        "Não foi possível carregar seus Planos de Estudo."

                });

        }

    }
);

// =====================================================
// CONSULTAR PDF MAIS RECENTE
// =====================================================

app.get(
    "/api/plano-estudo/:usuarioId/pdf-atual",
    async (req, res) => {

        const usuarioId =
            parseInt(
                req.params.usuarioId,
                10
            );


        try {

            const resultado =
                await pool.query(
                    `
                    SELECT

                        pe.id
                            AS plano_id,

                        pdf.id
                            AS pdf_id,

                        pdf.nome_arquivo,

                        pdf.tamanho_bytes,

                        pdf.versao

                    FROM plano_estudo pe

                    LEFT JOIN plano_estudo_pdf pdf
                        ON pdf.plano_id =
                            pe.id

                    WHERE pe.usuario_id = $1

                    ORDER BY
                        pe.criado_em DESC,
                        pe.id DESC

                    LIMIT 1
                    `,
                    [
                        usuarioId
                    ]
                );


            if (
                resultado.rows.length === 0
            ) {

                return res.json({

                    sucesso: true,

                    planoExiste: false,

                    pdfDisponivel: false

                });

            }


            const linha =
                resultado.rows[0];


            return res.json({

                sucesso: true,

                planoExiste: true,

                planoId:
                    linha.plano_id,

                pdfDisponivel:
                    Boolean(
                        linha.pdf_id
                    ),

                pdf:
                    linha.pdf_id
                        ? {

                            id:
                                linha.pdf_id,

                            nomeArquivo:
                                linha.nome_arquivo,

                            tamanhoBytes:
                                linha.tamanho_bytes,

                            versao:
                                linha.versao,

                            urlDownload:
                                `/api/plano-estudo/${usuarioId}/${linha.plano_id}/pdf/download`

                        }
                        : null

            });


        } catch (erro) {

            console.error(
                "Erro ao verificar PDF:",
                erro
            );


            return res
                .status(500)
                .json({

                    sucesso: false,

                    erro:
                        "Não foi possível verificar o PDF."

                });

        }

    }
);


// =====================================================
// DOWNLOAD DO PDF
// =====================================================

app.get(
    "/api/plano-estudo/:usuarioId/:planoId/pdf/download",
    async (req, res) => {

        const usuarioId =
            parseInt(
                req.params.usuarioId,
                10
            );

        const planoId =
            parseInt(
                req.params.planoId,
                10
            );


        try {

            const resultado =
                await pool.query(
                    `
                    SELECT

                        nome_arquivo,
                        mime_type,
                        arquivo_pdf,
                        tamanho_bytes

                    FROM plano_estudo_pdf

                    WHERE plano_id = $1
                      AND usuario_id = $2
                    `,
                    [
                        planoId,
                        usuarioId
                    ]
                );


            if (
                resultado.rows.length === 0
            ) {

                return res
                    .status(404)
                    .json({

                        sucesso: false,

                        erro:
                            "PDF não encontrado."

                    });

            }


            const pdf =
                resultado.rows[0];


            res.setHeader(
                "Content-Type",
                pdf.mime_type
            );


            res.setHeader(
                "Content-Length",
                pdf.tamanho_bytes
            );


            res.setHeader(
                "Content-Disposition",
                `attachment; filename="${pdf.nome_arquivo}"`
            );


            res.setHeader(
                "Cache-Control",
                "private, no-store"
            );


            return res.end(
                pdf.arquivo_pdf
            );


        } catch (erro) {

            console.error(
                "Erro no download do PDF:",
                erro
            );


            return res
                .status(500)
                .json({

                    sucesso: false,

                    erro:
                        "Não foi possível baixar o PDF."

                });

        }

    }
);




// =====================================================
// FOTO DE PERFIL
// =====================================================


// =====================================================
// SALVAR / TROCAR FOTO
// =====================================================

app.put(
    "/api/usuario/:usuarioId/foto",
    async (req, res) => {

        const usuarioId =
            parseInt(req.params.usuarioId, 10);

        const {
            imagemBase64
        } = req.body;


        if (
            !Number.isInteger(usuarioId) ||
            usuarioId <= 0
        ) {

            return res.status(400).json({
                sucesso: false,
                erro: "ID de usuário inválido."
            });

        }


        if (
            !imagemBase64 ||
            typeof imagemBase64 !== "string"
        ) {

            return res.status(400).json({
                sucesso: false,
                erro: "Nenhuma imagem foi enviada."
            });

        }


        try {

            // ==========================================
            // CONFIRMA QUE O USUÁRIO EXISTE
            // ==========================================

            const usuario =
                await pool.query(
                    `
                    SELECT id
                    FROM usuario
                    WHERE id = $1
                    `,
                    [usuarioId]
                );


            if (usuario.rows.length === 0) {

                return res.status(404).json({
                    sucesso: false,
                    erro: "Usuário não encontrado."
                });

            }


            // ==========================================
            // SEPARA MIME TYPE E BASE64
            // ==========================================

            const correspondencia =
                imagemBase64.match(
                    /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/
                );


            if (!correspondencia) {

                return res.status(400).json({
                    sucesso: false,
                    erro: "Formato de imagem inválido."
                });

            }


            const mimeType =
                correspondencia[1];


            const base64 =
                correspondencia[2];


            const imagemBuffer =
                Buffer.from(
                    base64,
                    "base64"
                );


            // ==========================================
            // SEGURANÇA - LIMITE DE 1 MB
            // ==========================================

            if (
                !imagemBuffer.length ||
                imagemBuffer.length > 1024 * 1024
            ) {

                return res.status(400).json({
                    sucesso: false,
                    erro:
                        "A foto processada ultrapassou o tamanho permitido."
                });

            }


            // ==========================================
            // SALVAR / ATUALIZAR
            // ==========================================

            const resultado =
                await pool.query(
                    `
                    INSERT INTO usuario_foto
                    (
                        usuario_id,
                        imagem,
                        mime_type
                    )

                    VALUES ($1, $2, $3)

                    ON CONFLICT (usuario_id)

                    DO UPDATE SET

                        imagem =
                            EXCLUDED.imagem,

                        mime_type =
                            EXCLUDED.mime_type,

                        atualizado_em =
                            CURRENT_TIMESTAMP

                    RETURNING
                        usuario_id,
                        mime_type,
                        atualizado_em
                    `,
                    [
                        usuarioId,
                        imagemBuffer,
                        mimeType
                    ]
                );


            console.log(
                "📷 Foto salva para o usuário:",
                usuarioId
            );


            return res.json({

                sucesso: true,

                mensagem:
                    "Foto de perfil salva com sucesso.",

                foto:
                    resultado.rows[0]

            });


        } catch (erro) {

            console.error(
                "❌ Erro ao salvar foto:",
                erro
            );


            return res.status(500).json({

                sucesso: false,

                erro:
                    "Não foi possível salvar a foto de perfil."

            });

        }

    }
);


// =====================================================
// BUSCAR FOTO
// =====================================================

app.get(
    "/api/usuario/:usuarioId/foto",
    async (req, res) => {

        const usuarioId =
            parseInt(req.params.usuarioId, 10);


        if (
            !Number.isInteger(usuarioId) ||
            usuarioId <= 0
        ) {

            return res.status(400).json({
                sucesso: false,
                erro: "ID de usuário inválido."
            });

        }


        try {

            const resultado =
                await pool.query(
                    `
                    SELECT
                        imagem,
                        mime_type

                    FROM usuario_foto

                    WHERE usuario_id = $1
                    `,
                    [usuarioId]
                );


            if (resultado.rows.length === 0) {

                return res.status(404).json({
                    sucesso: false,
                    erro: "Usuário não possui foto."
                });

            }


            const foto =
                resultado.rows[0];


            // Evita o navegador mostrar
            // uma foto antiga depois da troca.
            res.set(
                "Cache-Control",
                "no-store, no-cache, must-revalidate"
            );


            res.type(foto.mime_type);


            return res.send(
                foto.imagem
            );


        } catch (erro) {

            console.error(
                "❌ Erro ao carregar foto:",
                erro
            );


            return res.status(500).json({
                sucesso: false,
                erro:
                    "Não foi possível carregar a foto."
            });

        }

    }
);


// =====================================================
// EXCLUIR FOTO
// =====================================================

app.delete(
    "/api/usuario/:usuarioId/foto",
    async (req, res) => {

        const usuarioId =
            parseInt(req.params.usuarioId, 10);


        if (
            !Number.isInteger(usuarioId) ||
            usuarioId <= 0
        ) {

            return res.status(400).json({
                sucesso: false,
                erro: "ID de usuário inválido."
            });

        }


        try {

            const resultado =
                await pool.query(
                    `
                    DELETE FROM usuario_foto

                    WHERE usuario_id = $1

                    RETURNING usuario_id
                    `,
                    [usuarioId]
                );


            if (resultado.rows.length === 0) {

                return res.status(404).json({
                    sucesso: false,
                    erro:
                        "O usuário não possui foto cadastrada."
                });

            }


            console.log(
                "🗑️ Foto excluída do usuário:",
                usuarioId
            );


            return res.json({

                sucesso: true,

                mensagem:
                    "Foto excluída com sucesso."

            });


        } catch (erro) {

            console.error(
                "❌ Erro ao excluir foto:",
                erro
            );


            return res.status(500).json({

                sucesso: false,

                erro:
                    "Não foi possível excluir a foto."

            });

        }

    }
);

// =====================================================
// CALENDÁRIO DO USUÁRIO
// =====================================================

const TIPOS_CALENDARIO_USUARIO =
    new Set([
        "tarefa",
        "evento",
        "meta"
    ]);


// =====================================================
// LISTAR ITENS DO CALENDÁRIO
// =====================================================

app.get(
    "/api/calendario/:usuarioId",
    async (req, res) => {

        const usuarioId =
            parseInt(req.params.usuarioId, 10);

        const {
            inicio,
            fim
        } = req.query;


        if (
            !Number.isInteger(usuarioId) ||
            usuarioId <= 0
        ) {

            return res.status(400).json({
                sucesso: false,
                erro: "ID de usuário inválido."
            });

        }


        if (
            !/^\d{4}-\d{2}-\d{2}$/.test(inicio || "") ||
            !/^\d{4}-\d{2}-\d{2}$/.test(fim || "")
        ) {

            return res.status(400).json({
                sucesso: false,
                erro: "Período do calendário inválido."
            });

        }


        try {

            const resultado =
                await pool.query(
                    `
                    SELECT

                        ci.id,
                        ci.tipo,
                        ci.subtipo,
                        ci.titulo,
                        ci.descricao,
                        ci.disciplina_id,

                        d.nome AS disciplina,

                        TO_CHAR(
                            ci.data_inicio,
                            'YYYY-MM-DD'
                        ) AS "dataInicio",

                        CASE
                            WHEN ci.hora_inicio IS NULL
                            THEN NULL
                            ELSE TO_CHAR(
                                ci.hora_inicio,
                                'HH24:MI'
                            )
                        END AS "horaInicio",

                        CASE
                            WHEN ci.data_fim IS NULL
                            THEN NULL
                            ELSE TO_CHAR(
                                ci.data_fim,
                                'YYYY-MM-DD'
                            )
                        END AS "dataFim",

                        CASE
                            WHEN ci.hora_fim IS NULL
                            THEN NULL
                            ELSE TO_CHAR(
                                ci.hora_fim,
                                'HH24:MI'
                            )
                        END AS "horaFim",

                        ci.prioridade,
                        ci.concluido,
                        ci.origem,
                        ci.origem_id AS "origemId",
                        ci.editavel_usuario AS "editavelUsuario",
                        ci.criado_em AS "criadoEm",
                        ci.atualizado_em AS "atualizadoEm"

                    FROM calendario_item ci

                    LEFT JOIN disciplina d
                        ON d.id = ci.disciplina_id

                    WHERE ci.usuario_id = $1

                      AND ci.data_inicio
                          BETWEEN $2::date
                          AND $3::date

                    ORDER BY
                        ci.data_inicio ASC,
                        ci.hora_inicio ASC NULLS LAST,
                        ci.id ASC
                    `,
                    [
                        usuarioId,
                        inicio,
                        fim
                    ]
                );


            return res.json({

                sucesso: true,

                itens:
                    resultado.rows

            });


        } catch (erro) {

            console.error(
                "❌ Erro ao carregar calendário:",
                erro
            );


            return res.status(500).json({

                sucesso: false,

                erro:
                    "Não foi possível carregar o calendário."

            });

        }

    }
);


// =====================================================
// CADASTRAR ITEM DO CALENDÁRIO
// TAREFA / EVENTO / META
// =====================================================

app.post(
    "/api/calendario/:usuarioId",
    async (req, res) => {

        const usuarioId =
            parseInt(req.params.usuarioId, 10);


        if (
            !Number.isInteger(usuarioId) ||
            usuarioId <= 0
        ) {

            return res.status(400).json({
                sucesso: false,
                erro: "ID de usuário inválido."
            });

        }


        const {

            tipo,
            subtipo,
            titulo,
            descricao,
            disciplinaId,
            dataInicio,
            horaInicio,
            dataFim,
            horaFim,
            prioridade

        } = req.body;


        if (
            !TIPOS_CALENDARIO_USUARIO.has(tipo)
        ) {

            return res.status(400).json({
                sucesso: false,
                erro: "Tipo de item inválido."
            });

        }


        if (
            !String(titulo || "").trim()
        ) {

            return res.status(400).json({
                sucesso: false,
                erro: "Informe o título."
            });

        }


        if (
            !/^\d{4}-\d{2}-\d{2}$/.test(
                dataInicio || ""
            )
        ) {

            return res.status(400).json({
                sucesso: false,
                erro: "Informe uma data válida."
            });

        }


        if (
            prioridade &&
            !["normal", "alta"].includes(
                prioridade
            )
        ) {

            return res.status(400).json({
                sucesso: false,
                erro: "Prioridade inválida."
            });

        }


        try {

            // Confirma que o usuário existe
            const usuario =
                await pool.query(
                    `
                    SELECT id
                    FROM usuario
                    WHERE id = $1
                    `,
                    [usuarioId]
                );


            if (usuario.rows.length === 0) {

                return res.status(404).json({
                    sucesso: false,
                    erro: "Usuário não encontrado."
                });

            }


            const resultado =
                await pool.query(
                    `
                    INSERT INTO calendario_item
                    (
                        usuario_id,
                        criado_por_usuario_id,
                        tipo,
                        subtipo,
                        titulo,
                        descricao,
                        disciplina_id,
                        data_inicio,
                        hora_inicio,
                        data_fim,
                        hora_fim,
                        prioridade,
                        concluido,
                        origem,
                        editavel_usuario
                    )

                    VALUES
                    (
                        $1,
                        $1,
                        $2,
                        $3,
                        $4,
                        $5,
                        $6,
                        $7,
                        $8,
                        $9,
                        $10,
                        $11,
                        FALSE,
                        'usuario',
                        TRUE
                    )

                    RETURNING id
                    `,
                    [
                        usuarioId,
                        tipo,
                        subtipo || null,
                        String(titulo).trim(),
                        String(descricao || "").trim()
                            || null,
                        disciplinaId
                            ? Number(disciplinaId)
                            : null,
                        dataInicio,
                        horaInicio || null,
                        dataFim || null,
                        horaFim || null,
                        tipo === "tarefa"
                            ? prioridade || "normal"
                            : null
                    ]
                );


            return res.status(201).json({

                sucesso: true,

                mensagem:
                    "Item cadastrado com sucesso.",

                id:
                    resultado.rows[0].id

            });


        } catch (erro) {

            console.error(
                "❌ Erro ao cadastrar item do calendário:",
                erro
            );


            return res.status(500).json({

                sucesso: false,

                erro:
                    "Não foi possível cadastrar o item."

            });

        }

    }
);


// =====================================================
// MARCAR ITEM COMO CONCLUÍDO / NÃO CONCLUÍDO
// =====================================================

app.patch(
    "/api/calendario/:usuarioId/:itemId/conclusao",
    async (req, res) => {

        const usuarioId =
            parseInt(req.params.usuarioId, 10);

        const itemId =
            parseInt(req.params.itemId, 10);

        const concluido =
            req.body.concluido === true;


        if (
            !Number.isInteger(usuarioId) ||
            !Number.isInteger(itemId)
        ) {

            return res.status(400).json({
                sucesso: false,
                erro: "Dados inválidos."
            });

        }


        try {

            const resultado =
                await pool.query(
                    `
                    UPDATE calendario_item

                    SET
                        concluido = $1,
                        atualizado_em =
                            CURRENT_TIMESTAMP

                    WHERE id = $2
                      AND usuario_id = $3

                    RETURNING id
                    `,
                    [
                        concluido,
                        itemId,
                        usuarioId
                    ]
                );


            if (
                resultado.rowCount === 0
            ) {

                return res.status(404).json({
                    sucesso: false,
                    erro: "Item não encontrado."
                });

            }


            return res.json({
                sucesso: true
            });


        } catch (erro) {

            console.error(
                "❌ Erro ao alterar conclusão:",
                erro
            );


            return res.status(500).json({
                sucesso: false,
                erro:
                    "Não foi possível atualizar o item."
            });

        }

    }
);


// =====================================================
// EXCLUIR ITEM
// =====================================================

app.delete(
    "/api/calendario/:usuarioId/:itemId",
    async (req, res) => {

        const usuarioId =
            parseInt(req.params.usuarioId, 10);

        const itemId =
            parseInt(req.params.itemId, 10);


        if (
            !Number.isInteger(usuarioId) ||
            !Number.isInteger(itemId)
        ) {

            return res.status(400).json({
                sucesso: false,
                erro: "Dados inválidos."
            });

        }


        try {

            const resultado =
                await pool.query(
                    `
                    DELETE FROM calendario_item

                    WHERE id = $1
                      AND usuario_id = $2
                      AND editavel_usuario = TRUE

                    RETURNING id
                    `,
                    [
                        itemId,
                        usuarioId
                    ]
                );


            if (
                resultado.rowCount === 0
            ) {

                return res.status(404).json({
                    sucesso: false,

                    erro:
                        "Item não encontrado ou não pode ser excluído."
                });

            }


            return res.json({
                sucesso: true,
                mensagem:
                    "Item excluído com sucesso."
            });


        } catch (erro) {

            console.error(
                "❌ Erro ao excluir item:",
                erro
            );


            return res.status(500).json({
                sucesso: false,
                erro:
                    "Não foi possível excluir o item."
            });

        }

    }
);

// =====================================================
// LISTAR TAREFAS DO USUÁRIO
// =====================================================

app.get(
    "/api/tarefas/:usuarioId",
    async (req, res) => {

        const usuarioId =
            parseInt(req.params.usuarioId, 10);


        if (
            !Number.isInteger(usuarioId) ||
            usuarioId <= 0
        ) {

            return res.status(400).json({
                sucesso: false,
                erro: "ID de usuário inválido."
            });

        }


        try {

            const resultado =
                await pool.query(
                    `
                    SELECT

                        ci.id,

                        ci.titulo,

                        ci.descricao,

                        ci.disciplina_id,

                        d.nome AS disciplina,

                        TO_CHAR(
                            ci.data_inicio,
                            'YYYY-MM-DD'
                        ) AS "dataInicio",

                        CASE

                            WHEN ci.hora_inicio IS NULL
                            THEN NULL

                            ELSE TO_CHAR(
                                ci.hora_inicio,
                                'HH24:MI'
                            )

                        END AS "horaInicio",

                        ci.prioridade,

                        ci.concluido,

                        ci.origem,

                        ci.editavel_usuario
                            AS "editavelUsuario"

                    FROM calendario_item ci

                    LEFT JOIN disciplina d
                        ON d.id =
                           ci.disciplina_id

                    WHERE
                        ci.usuario_id = $1

                        AND ci.tipo = 'tarefa'

                    ORDER BY

                        ci.concluido ASC,

                        ci.data_inicio ASC,

                        ci.hora_inicio ASC
                            NULLS LAST,

                        ci.id DESC
                    `,
                    [usuarioId]
                );


            return res.json({

                sucesso: true,

                tarefas:
                    resultado.rows

            });


        } catch (erro) {

            console.error(
                "❌ Erro ao carregar tarefas:",
                erro
            );


            return res.status(500).json({

                sucesso: false,

                erro:
                    "Não foi possível carregar as tarefas."

            });

        }

    }
);

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
