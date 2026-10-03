"use strict";

// Rota do Sucesso — geração V4 semanal.
// Não altera /api/plano-estudo/gerar (preparação) nem as rotas V3 legadas.
// IMPORTANTE: requer a migração 20261002_v4_solicitacao.sql.
// A geração paga só acontece se ROTA_V4_GERACAO_ATIVA=SIM.

const crypto = require("node:crypto");

const OBJETIVOS = new Set([
  "organizar_rotina", "melhorar_desempenho", "recuperar_dificuldades",
  "preparar_provas", "enem_vestibular", "criar_habito",
  "aprofundar_conhecimentos", "outro"
]);

function proximaSegundaUTC(agora = new Date()) {
  const dia = new Date(Date.UTC(
    agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate(), 12
  ));
  const acrescimo = (8 - dia.getUTCDay()) % 7 || 7;
  dia.setUTCDate(dia.getUTCDate() + acrescimo);
  const inicio = dia.toISOString().slice(0, 10);
  dia.setUTCDate(dia.getUTCDate() + 6);
  return { dataInicio: inicio, dataFim: dia.toISOString().slice(0, 10) };
}

function erroHttp(mensagem, status = 400) {
  return Object.assign(new Error(mensagem), { status });
}

module.exports = function registrarPlanoV4({
  app, pool, anthropic, montarPayloadPlanoEstudo, prepararDadosClaude,
  // Sobrescritas exclusivas para testes locais sem módulos reais e sem API.
  montarPromptV4: montarPromptV4Teste,
  schemaV4: schemaV4Teste,
  validarV4: validarV4Teste,
  prepararV3: prepararV3Teste,
  salvarV3: salvarV3Teste
}) {
  const montarPromptV4 = montarPromptV4Teste || require("./prompt-plano-claude-v4");
  const schemaV4 = schemaV4Teste || require("./schema-plano-claude-v4");
  const validarV4 = validarV4Teste || require("./validar-plano-claude-v4");
  const prepararV3 = prepararV3Teste || require("./preparar-gravacao-claude-v3");
  const salvarV3 = salvarV3Teste || require("./salvar-plano-claude-v3");

  // Proteção contra duplo clique e duas abas na mesma instância.
  const emAndamento = new Set();

  async function preparar(usuarioId) {
    const payload = await montarPayloadPlanoEstudo(usuarioId);
    const objetivo = await pool.query(
      `SELECT id, objetivo, objetivo_outro, tipo_planejamento
         FROM plano_estudo_objetivo WHERE usuario_id = $1`, [usuarioId]
    );
    if (objetivo.rowCount !== 1 && objetivo.rows.length !== 1) {
      throw erroHttp("Escolha e salve o objetivo antes de gerar o plano.");
    }
    const meta = objetivo.rows[0];
    if (!OBJETIVOS.has(meta.objetivo)) {
      throw erroHttp("Objetivo do plano inválido.");
    }
    // A única configuração comprovada pelo piloto recebido é semanal.
    if (meta.tipo_planejamento !== "semanal") {
      throw erroHttp(
        "A geração V4 mensal ainda não foi validada. Selecione Plano Semanal.", 422
      );
    }
    const { rows: disciplinas } = await pool.query(
      `SELECT id, nome FROM disciplina
       WHERE nome IS NOT NULL AND TRIM(nome) <> '' ORDER BY nome`
    );
    if (!disciplinas.length) {
      throw erroHttp("Nenhuma disciplina cadastrada no banco.");
    }
    const dados = {
      ...prepararDadosClaude(payload),
      tipoPlanejamento: "semanal"
    };
    const periodo = proximaSegundaUTC();
    const config = {
      ...periodo,
      disciplinas: disciplinas.map(d => d.nome)
    };
    // Valida a montagem do prompt sem acionamento pago.
    const prompt = montarPromptV4(dados, config);
    if (!prompt || !prompt.system || !prompt.user) {
      throw erroHttp("O prompt V4 está incompleto.", 500);
    }
    return { dados, meta, disciplinas, config, prompt };
  }

  async function statusSolicitacao(usuarioId, meta, config) {
    const q = await pool.query(
      `SELECT id, status, resposta_bruta, modelo, uso, plano_id
       FROM plano_v4_solicitacao
       WHERE usuario_id = $1 AND objetivo_id = $2
         AND data_inicio = $3::date AND data_fim = $4::date`,
      [usuarioId, meta.id, config.dataInicio, config.dataFim]
    );
    return q.rows[0] || null;
  }

  function entradaValida(req, res) {
    const usuarioId = Number(req.params.usuarioId);
    if (!Number.isSafeInteger(usuarioId) || usuarioId <= 0) {
      res.status(400).json({ sucesso: false, erro: "ID de usuário inválido." });
      return null;
    }
    return usuarioId;
  }

  app.get("/api/plano-estudo/v4/preview/:usuarioId", async (req, res) => {
    const usuarioId = entradaValida(req, res);
    if (!usuarioId) return;
    try {
      const { meta, config, disciplinas } = await preparar(usuarioId);
      const anterior = await statusSolicitacao(usuarioId, meta, config);
      return res.json({
        sucesso: true, claudeAcionado: false,
        geracaoHabilitada: process.env.ROTA_V4_GERACAO_ATIVA === "SIM",
        tipoPlanejamento: "semanal",
        periodo: { dataInicio: config.dataInicio, dataFim: config.dataFim },
        disciplinas: disciplinas.length,
        estado: anterior?.status || "nao_iniciada",
        planoId: anterior?.plano_id || null
      });
    } catch (erro) {
      console.error("Preparação V4:", erro.message);
      return res.status(erro.status || 500).json({
        sucesso: false, erro: erro.message || "Falha na preparação V4."
      });
    }
  });

  app.post("/api/plano-estudo/v4/gerar/:usuarioId", async (req, res) => {
    const usuarioId = entradaValida(req, res);
    if (!usuarioId) return;
    if (req.body?.confirmar !== "GERAR_PLANO_V4") {
      return res.status(400).json({ sucesso: false, erro: "Confirmação obrigatória." });
    }
    if (emAndamento.has(usuarioId)) {
      return res.status(409).json({
        sucesso: false, erro: "Seu plano já está sendo processado. Aguarde."
      });
    }
    emAndamento.add(usuarioId);
    try {
      const { dados, meta, disciplinas, config, prompt } = await preparar(usuarioId);
      let tentativa = await statusSolicitacao(usuarioId, meta, config);
      if (tentativa?.status === "salvo" && tentativa.plano_id) {
        return res.json({ sucesso: true, planoId: Number(tentativa.plano_id), reutilizado: true });
      }
      // Havendo resposta já cobrada, NUNCA fazer segunda chamada à IA.
      let respostaTexto;
      let modelo;
      let uso;
      if (tentativa?.resposta_bruta) {
        respostaTexto = tentativa.resposta_bruta;
        modelo = tentativa.modelo;
        uso = tentativa.uso;
      } else {
        if (tentativa) {
          throw erroHttp(
            "Há uma geração anterior com resultado incerto. Não repita a chamada paga; verifique o registro plano_v4_solicitacao.",
            409
          );
        }
        if (process.env.ROTA_V4_GERACAO_ATIVA !== "SIM") {
          throw erroHttp(
            "Geração paga desativada. Teste /api/plano-estudo/v4/preview primeiro.", 503
          );
        }
        if (!process.env.ANTHROPIC_API_KEY) {
          throw erroHttp("ANTHROPIC_API_KEY não configurada.", 503);
        }

        // Reserva atômica evita cobrança dupla entre diferentes instâncias.
        // Em caso de queda durante a API, status 'iniciado' exige análise humana
        // antes de qualquer nova cobrança.
        const reserva = await pool.query(
          `INSERT INTO plano_v4_solicitacao
           (usuario_id, objetivo_id, data_inicio, data_fim, status)
           VALUES ($1, $2, $3::date, $4::date, 'iniciado')
           ON CONFLICT (usuario_id, objetivo_id, data_inicio, data_fim)
           DO NOTHING RETURNING id`,
          [usuarioId, meta.id, config.dataInicio, config.dataFim]
        );
        if (reserva.rows.length !== 1) {
          throw erroHttp("Já existe uma solicitação deste plano. Aguarde ou consulte Meus Planos.", 409);
        }
        tentativa = { id: reserva.rows[0].id };

        const respostaClaude = await anthropic.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 12000,
          system: prompt.system,
          messages: [{ role: "user", content: prompt.user }],
          output_config: {
            format: { type: "json_schema", schema: schemaV4 }
          }
        }, { maxRetries: 0 });
        respostaTexto = respostaClaude.content
          .filter(bloco => bloco.type === "text")
          .map(bloco => bloco.text).join("").trim();
        modelo = respostaClaude.model;
        uso = respostaClaude.usage || {};

        // Preserva inclusive respostas incompletas, para análise sem recobrança.
        await pool.query(
          `UPDATE plano_v4_solicitacao
           SET status = 'respondido', resposta_bruta = $2,
               modelo = $3, uso = $4::jsonb, atualizado_em = NOW()
           WHERE id = $1`,
          [tentativa.id, respostaTexto, modelo, JSON.stringify({
            ...uso, motivoEncerramento: respostaClaude.stop_reason
          })]
        );
        if (respostaClaude.stop_reason !== "end_turn") {
          throw erroHttp(
            "A IA retornou uma resposta incompleta, preservada no banco. Não solicite uma nova geração.",
            502
          );
        }
      }

      if (uso?.motivoEncerramento && uso.motivoEncerramento !== "end_turn") {
        throw erroHttp(
          "A resposta anterior foi interrompida e foi preservada. Solicite análise técnica; não repita a geração paga.",
          409
        );
      }
      let plano;
      try {
        plano = JSON.parse(respostaTexto);
      } catch {
        throw erroHttp(
          "A resposta paga foi preservada, mas o JSON não pôde ser interpretado. Não repita a geração.",
          502
        );
      }
      const validacao = validarV4(plano, dados, config);
      if (!validacao.valido) {
        console.error("Validação V4:", validacao.erros);
        throw erroHttp(
          "A resposta foi preservada, mas a validação pedagógica falhou. Não refaça a chamada paga.",
          422
        );
      }


      // Localizar ou criar o objetivo na tabela utilizada
// pelo sistema de gravação dos planos.

const tipoObjetivo = meta.objetivo;

const descricaoObjetivo =
    tipoObjetivo === "outro"
        ? String(meta.objetivo_outro || "Outro objetivo").trim()
        : tipoObjetivo.replace(/_/g, " ");

let objetivoRelacional = await pool.query(
    `
    SELECT id
    FROM objetivo_estudo
    WHERE usuario_id = $1
      AND tipo_objetivo = $2
      AND ativo = TRUE
    ORDER BY objetivo_principal DESC NULLS LAST, id DESC
    LIMIT 1
    `,
    [usuarioId, tipoObjetivo]
);

if (objetivoRelacional.rows.length === 0) {

    objetivoRelacional = await pool.query(
        `
        INSERT INTO objetivo_estudo
        (
            usuario_id,
            tipo_objetivo,
            descricao,
            objetivo_principal,
            ativo
        )
        VALUES ($1, $2, $3, TRUE, TRUE)
        RETURNING id
        `,
        [
            usuarioId,
            tipoObjetivo,
            descricaoObjetivo
        ]
    );

}

const objetivoEstudoId =
    Number(objetivoRelacional.rows[0]?.id);

if (
    !Number.isSafeInteger(objetivoEstudoId) ||
    objetivoEstudoId <= 0
) {
    throw erroHttp(
        "Não foi possível associar o objetivo.",
        500
    );
}

      // Conversão comprovada pelo piloto: salvar usando o conversor transacional V3.
      const preparado = prepararV3({
        resultado: {
          sucesso: true, usuarioId, modelo, uso, validacao,
          plano: { ...plano, versao: 3 }
        },
        usuarioId,
        objetivoId: objetivoEstudoId,
        dadosClaude: dados,
        disciplinas,
        dataInicio: config.dataInicio,
        dataFim: config.dataFim
      });
      if (!Array.isArray(preparado?.itens) ||
          preparado.itens.length !== plano.sessoes.length) {
        throw erroHttp(
          "A conversão do V4 produziu uma quantidade diferente de sessões. Resposta paga preservada.",
          422
        );
      }
      preparado.hashGeracao = crypto.createHash("sha256")
        .update(JSON.stringify({ formato: "V4", usuarioId,
          objetivoId: objetivoEstudoId, ...config, plano }))
        .digest("hex");
      preparado.cabecalho.versao_esquema_ia = 4;
      preparado.cabecalho.diagnostico_ia = {
        ...plano.diagnostico,
        metasSemanais: plano.metasSemanais,
        acompanhamento: plano.acompanhamento
      };
      preparado.itens.forEach((item, indice) => {
        const sessao = plano.sessoes[indice];
        item.sugestao_questoes_ia = {
          ...sessao.sugestaoQuestoes,
          objetivoAprendizagem: sessao.objetivoAprendizagem,
          roteiro: sessao.roteiro,
          recursos: sessao.recursos,
          criterioSucesso: sessao.criterioSucesso
        };
      });
      const gravado = await salvarV3(pool, preparado);
      const planoId = Number(gravado.planoId);
      if (!Number.isSafeInteger(planoId) || planoId <= 0) {
        throw erroHttp("A gravação não retornou um planoId válido. Resposta paga preservada.", 500);
      }
      await pool.query(
        `UPDATE plano_v4_solicitacao
         SET status = 'salvo', plano_id = $2, atualizado_em = NOW()
         WHERE id = $1`,
        [tentativa.id, planoId]
      );
      return res.json({ sucesso: true, planoId, reutilizado: false,
        mensagem: "Plano V4 salvo no banco com sucesso." });
    } catch (erro) {
      console.error("Geração V4:", erro.message);
      return res.status(
        Number.isInteger(erro.status) && erro.status >= 400 && erro.status < 600
          ? erro.status : 500
      ).json({
        sucesso: false,
        erro: erro.status
          ? erro.message
          : "A geração não foi concluída. Consulte o estado da solicitação antes de tentar novamente."
      });
    } finally {
      emAndamento.delete(usuarioId);
    }
  });
};

// Exporta somente o cálculo puro para testes sem banco e sem API.
module.exports.proximaSegundaUTC = proximaSegundaUTC;
