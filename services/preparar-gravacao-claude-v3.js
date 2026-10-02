const crypto = require("node:crypto");

const validarPlanoClaude =
    require("./validar-plano-claude");

const PRIORIDADES = {
    alta: 1,
    media: 2,
    normal: 3
};

function prepararGravacaoClaude({
    resultado,
    usuarioId,
    objetivoId = null,
    dadosClaude,
    disciplinas,
    dataInicio,
    dataFim
}) {

    if (
        !resultado ||
        resultado.sucesso !== true ||
        !resultado.plano ||
        Number(resultado.usuarioId) !== usuarioId
    ) {
        throw new Error(
            "Resposta do Claude inválida ou pertencente a outro usuário."
        );
    }

    if (
        !Array.isArray(disciplinas) ||
        disciplinas.length === 0
    ) {
        throw new Error(
            "As disciplinas do Neon não foram informadas."
        );
    }

    // O arquivo atual é um piloto semanal.
    // Não alterar a preferência mensal do aluno.

    const dadosTeste = {
        ...dadosClaude,
        tipoPlanejamento: "semanal"
    };

    const configuracao = {
        dataInicio,
        dataFim,
        disciplinas: disciplinas.map(item => item.nome)
    };

    // Não confiar apenas na validação que veio
    // armazenada no arquivo JSON.

    const validacao = validarPlanoClaude(
        resultado.plano,
        dadosTeste,
        configuracao
    );

    if (!validacao.valido) {
        throw new Error(
            "Plano reprovado: " +
            validacao.erros.join("; ")
        );
    }

    if (resultado.plano.versao !== 3) {
        throw new Error(
            "Versão do plano incompatível."
        );
    }

    const idsDisciplinas = new Map(
        disciplinas.map(item => [
            item.nome,
            Number(item.id)
        ])
    );

    const itens = resultado.plano.sessoes.map(
        (sessao, indice) => {

            const disciplinaId =
                idsDisciplinas.get(
                    sessao.disciplina
                );

            if (
                !Number.isInteger(disciplinaId) ||
                !Object.hasOwn(
                    PRIORIDADES,
                    sessao.prioridade
                )
            ) {
                throw new Error(
                    `Sessão ${indice + 1}: disciplina ou prioridade inválida.`
                );
            }

            return {
                disciplina_id: disciplinaId,

                data_prevista: sessao.data,
                hora_inicio: sessao.horaInicio,
                hora_fim: sessao.horaFim,

                duracao_min: sessao.duracaoMin,

                prioridade:
                    PRIORIDADES[sessao.prioridade],

                conteudo_ia:
                    sessao.conteudo,

                metodologia_detalhada_ia:
                    sessao.metodologia,

                atividade_detalhada_ia:
                    sessao.atividade,

                sugestao_questoes_ia:
                    sessao.sugestaoQuestoes
            };
        }
    );

    // Somente calcular o identificador definitivo
    // quando soubermos o objetivo_id correto.

    const hashGeracao = objetivoId
        ? crypto
            .createHash("sha256")
            .update(JSON.stringify({
                usuarioId,
                objetivoId,
                dataInicio,
                dataFim,
                tipoPlanejamento: "semanal",
                plano: resultado.plano
            }))
            .digest("hex")
        : null;

    return {
        usuarioId,
        objetivoId,
        hashGeracao,

        cabecalho: {
            usuario_id: usuarioId,
            objetivo_id: objetivoId,

            tipo_planejamento: "semanal",

            data_inicio: dataInicio,
            data_fim: dataFim,

            gerado_por_ia: true,

            resumo_ia:
                resultado.plano.resumo,

            diagnostico_ia:
                resultado.plano.diagnostico,

            distribuicao_ia:
                resultado.plano.distribuicao,

            recomendacoes_ia:
                resultado.plano.recomendacoes,

            modelo_ia:
                resultado.modelo,

            versao_esquema_ia: 3,

            tokens_entrada_ia:
                resultado.uso?.input_tokens || 0,

            tokens_saida_ia:
                resultado.uso?.output_tokens || 0
        },

        itens,
        validacao
    };
}

module.exports = prepararGravacaoClaude;