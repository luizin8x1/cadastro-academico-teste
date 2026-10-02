async function salvarPlanoClaudeV3(pool, preparado) {

    const {
        usuarioId,
        objetivoId,
        hashGeracao,
        cabecalho,
        itens,
        validacao
    } = preparado || {};

    if (
        !Number.isInteger(usuarioId) ||
        !Number.isInteger(objetivoId) ||
        !/^[a-f0-9]{64}$/.test(hashGeracao || "") ||
        !validacao?.valido ||
        !Array.isArray(itens) ||
        itens.length === 0 ||
        cabecalho?.usuario_id !== usuarioId ||
        cabecalho?.objetivo_id !== objetivoId
    ) {
        throw new Error(
            "Dados inválidos para gravação do plano."
        );
    }

    const client = await pool.connect();
    let transacaoAberta = false;

    try {
        await client.query("BEGIN");
        transacaoAberta = true;

        // Impede duas gravações simultâneas
        // do mesmo objetivo pelo nosso serviço.
        await client.query(
            "SELECT pg_advisory_xact_lock($1::int, $2::int)",
            [usuarioId, objetivoId]
        );

        // O objetivo deve pertencer ao estudante.
        const objetivo = await client.query(
            `SELECT id
             FROM objetivo_estudo
             WHERE id = $1
               AND usuario_id = $2
               AND ativo = TRUE`,
            [objetivoId, usuarioId]
        );

        if (objetivo.rows.length === 0) {
            throw new Error(
                "Objetivo inexistente, inativo ou pertencente a outro estudante."
            );
        }

        // A mesma resposta do Claude não pode
        // produzir dois planos.
        const existente = await client.query(
            `SELECT id
             FROM plano_estudo
             WHERE usuario_id = $1
               AND hash_geracao_ia = $2`,
            [usuarioId, hashGeracao]
        );

        if (existente.rows.length > 0) {
            await client.query("COMMIT");
            transacaoAberta = false;

            return {
                sucesso: true,
                jaExistia: true,
                planoId: existente.rows[0].id
            };
        }

        const plano = await client.query(
            `INSERT INTO plano_estudo (
                usuario_id,
                objetivo_id,
                tipo_planejamento,
                data_inicio,
                data_fim,
                gerado_por_ia,
                resumo_ia,
                diagnostico_ia,
                distribuicao_ia,
                recomendacoes_ia,
                modelo_ia,
                versao_esquema_ia,
                tokens_entrada_ia,
                tokens_saida_ia,
                hash_geracao_ia
            )
            VALUES (
                $1, $2, $3, $4, $5,
                $6, $7, $8, $9, $10,
                $11, $12, $13, $14, $15
            )
            RETURNING id`,
            [
                usuarioId,
                objetivoId,
                cabecalho.tipo_planejamento,
                cabecalho.data_inicio,
                cabecalho.data_fim,
                true,
                cabecalho.resumo_ia,
                JSON.stringify(cabecalho.diagnostico_ia),
                JSON.stringify(cabecalho.distribuicao_ia),
                JSON.stringify(cabecalho.recomendacoes_ia),
                cabecalho.modelo_ia,
                cabecalho.versao_esquema_ia,
                cabecalho.tokens_entrada_ia,
                cabecalho.tokens_saida_ia,
                hashGeracao
            ]
        );

        const planoId = plano.rows[0].id;

        for (const item of itens) {

            await client.query(
                `INSERT INTO plano_estudo_item (
                    plano_id,
                    disciplina_id,
                    data_prevista,
                    hora_inicio,
                    hora_fim,
                    atividade,
                    metodo_estudo,
                    duracao_min,
                    prioridade,
                    conteudo_ia,
                    metodologia_detalhada_ia,
                    atividade_detalhada_ia,
                    sugestao_questoes_ia
                )
                VALUES (
                    $1, $2, $3, $4, $5,
                    $6, $7, $8, $9, $10,
                    $11, $12, $13
                )`,
                [
                    planoId,
                    item.disciplina_id,
                    item.data_prevista,
                    item.hora_inicio,
                    item.hora_fim,

                    // Campos antigos: valores curtos
                    // para manter a compatibilidade.
                    "Estudo orientado",
                    "IA",

                    item.duracao_min,
                    item.prioridade,

                    // Conteúdo completo do Claude.
                    item.conteudo_ia,
                    item.metodologia_detalhada_ia,
                    item.atividade_detalhada_ia,
                    JSON.stringify(
                        item.sugestao_questoes_ia
                    )
                ]
            );
        }

        await client.query("COMMIT");
        transacaoAberta = false;

        return {
            sucesso: true,
            jaExistia: false,
            planoId,
            sessoesGravadas: itens.length
        };

    } catch (erro) {

        if (transacaoAberta) {
            await client.query("ROLLBACK");
        }

        throw erro;

    } finally {
        client.release();
    }
}

module.exports = salvarPlanoClaudeV3;