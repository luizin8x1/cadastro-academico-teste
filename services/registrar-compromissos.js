"use strict";

// Lista tarefas, metas e eventos cadastrados.
// A autenticação é realizada pelo middleware do server.js.

module.exports = function registrarCompromissos({ app, pool }) {

    app.get("/api/compromissos/:usuarioId", async (req, res) => {

        const usuarioId = Number(req.params.usuarioId);

        if (!Number.isSafeInteger(usuarioId) || usuarioId <= 0) {
            return res.status(400).json({
                sucesso: false,
                erro: "Usuário inválido."
            });
        }

        try {

            const resultado = await pool.query(`
                SELECT
                    ci.id,
                    ci.tipo,
                    ci.subtipo,
                    ci.titulo,
                    ci.descricao,

                    ci.disciplina_id AS "disciplinaId",
                    d.nome AS disciplina,

                    TO_CHAR(
                        ci.data_inicio,
                        'YYYY-MM-DD'
                    ) AS "dataInicio",

                    TO_CHAR(
                        ci.hora_inicio,
                        'HH24:MI'
                    ) AS "horaInicio",

                    ci.prioridade,
                    ci.concluido,
                    ci.origem,

                    ci.editavel_usuario AS "editavelUsuario"

                FROM calendario_item ci

                LEFT JOIN disciplina d
                    ON d.id = ci.disciplina_id

                WHERE ci.usuario_id = $1

                  AND ci.tipo IN (
                      'tarefa',
                      'meta',
                      'evento'
                  )

                ORDER BY
                    ci.concluido ASC,
                    ci.data_inicio ASC,
                    ci.hora_inicio ASC NULLS LAST,
                    ci.id DESC
            `, [usuarioId]);

            return res.json({
                sucesso: true,
                compromissos: resultado.rows
            });

        } catch (erro) {

            console.error(
                "Erro ao listar compromissos:",
                erro
            );

            return res.status(500).json({
                sucesso: false,
                erro: "Não foi possível carregar os compromissos."
            });
        }
    });
};