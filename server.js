

require("dotenv").config();

const express = require("express");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const cors = require("cors");
const path = require("path");
const Anthropic = require("@anthropic-ai/sdk");

const app = express();
app.use(cors());
app.use(express.json());

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

        return res.json({
            sucesso: true,
            dificuldades: resultado.rows
        });

    } catch (erro) {

        console.error("❌ Erro ao buscar dificuldades:", erro);

        return res.status(500).json({
            sucesso: false,
            erro: "Erro ao buscar dificuldades do aluno."
        });
    }
});


// =====================================================
// SALVAR / ATUALIZAR DIFICULDADES DO ALUNO
// =====================================================

app.put("/api/perfil-dificuldades/:usuarioId", async (req, res) => {

    const usuarioId = parseInt(req.params.usuarioId, 10);

    if (isNaN(usuarioId)) {
        return res.status(400).json({
            sucesso: false,
            erro: "ID de usuário inválido."
        });
    }

    const { dificuldades } = req.body;

    if (!Array.isArray(dificuldades)) {
        return res.status(400).json({
            sucesso: false,
            erro: "Lista de dificuldades inválida."
        });
    }

    // Máximo de 3 disciplinas
    if (dificuldades.length > 3) {
        return res.status(400).json({
            sucesso: false,
            erro: "Selecione no máximo 3 disciplinas."
        });
    }

    const client = await pool.connect();

    try {

        await client.query("BEGIN");

        // Remove os registros antigos do aluno.
        // Depois recriamos de acordo com o formulário atual.
        await client.query(
            `
            DELETE FROM perfil_dificuldade
            WHERE usuario_id = $1
            `,
            [usuarioId]
        );

        for (const item of dificuldades) {

            const disciplinaId = parseInt(item.disciplinaId, 10);

            if (isNaN(disciplinaId)) {
                throw new Error("Disciplina inválida.");
            }

            await client.query(
                `
                INSERT INTO perfil_dificuldade (
                    usuario_id,
                    disciplina_id,
                    conteudo_1,
                    conteudo_2,
                    conteudo_3,
                    atualizado_em
                )
                VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
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

        await client.query("COMMIT");

        return res.json({
            sucesso: true,
            mensagem: "Dificuldades salvas com sucesso."
        });

    } catch (erro) {

        await client.query("ROLLBACK");

        console.error("❌ Erro ao salvar dificuldades:", erro);

        return res.status(500).json({
            sucesso: false,
            erro: "Erro ao salvar dificuldades."
        });

    } finally {

        client.release();
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


app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
