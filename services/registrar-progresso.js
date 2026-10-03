"use strict";

module.exports = function registrarProgresso({ app, pool }) {

    function dataBrasil(data) {
        const partes = new Intl.DateTimeFormat("en-US", {
            timeZone: "America/Sao_Paulo",
            year: "numeric",
            month: "2-digit",
            day: "2-digit"
        }).formatToParts(data);

        const campo = nome =>
            partes.find(p => p.type === nome)?.value;

        return `${campo("year")}-${campo("month")}-${campo("day")}`;
    }

    function adicionarDias(chave, dias) {
        const data = new Date(`${chave}T12:00:00Z`);
        data.setUTCDate(data.getUTCDate() + dias);
        return data.toISOString().slice(0, 10);
    }

    function horasPrevistas(tarefa) {

        if (!tarefa.hora_inicio || !tarefa.hora_fim) {
            return 0;
        }

        const converter = valor => {
            const texto = String(valor).slice(0, 5);

            if (!/^\d{2}:\d{2}$/.test(texto)) {
                return NaN;
            }

            const [hora, minuto] =
                texto.split(":").map(Number);

            return hora <= 23 && minuto <= 59
                ? hora * 60 + minuto
                : NaN;
        };

        const minutos =
            converter(tarefa.hora_fim) -
            converter(tarefa.hora_inicio);

        return Number.isFinite(minutos) &&
               minutos > 0 &&
               minutos <= 1440
            ? minutos / 60
            : 0;
    }

    // CONSULTAR PROGRESSO DO ALUNO
    app.get("/api/progresso/:usuarioId", async (req, res) => {

        const usuarioId = Number(req.params.usuarioId);

        if (
            !Number.isSafeInteger(usuarioId) ||
            usuarioId <= 0
        ) {
            return res.status(400).json({
                sucesso: false,
                erro: "Usuário inválido."
            });
        }

        try {

            const resultado = await pool.query(
                `
                SELECT
                     ci.tipo,

                    COALESCE(
                        d.nome,
                        'Sem disciplina'
                    ) AS disciplina,

                    TO_CHAR(
                        ci.data_inicio::date,
                        'YYYY-MM-DD'
                    ) AS dia,

                    TO_CHAR(
                        ci.hora_inicio,
                        'HH24:MI'
                    ) AS hora_inicio,

                    TO_CHAR(
                        ci.hora_fim,
                        'HH24:MI'
                    ) AS hora_fim,

                    ci.concluido

                FROM calendario_item ci

                LEFT JOIN disciplina d
                    ON d.id = ci.disciplina_id

                WHERE ci.usuario_id = $1
                AND ci.tipo IN ('tarefa', 'meta', 'evento')

                ORDER BY ci.data_inicio, ci.id
                `,
                [usuarioId]
            );

            const compromissos = resultado.rows;

const concluidos = compromissos.filter(
    item => item.concluido === true
);

            // SEMANA ATUAL E ANTERIOR

            const hoje = dataBrasil(new Date());

            const diaSemana =
                (
                    new Date(`${hoje}T12:00:00Z`)
                        .getUTCDay() + 6
                ) % 7;

            const inicioSemana =
                adicionarDias(hoje, -diaSemana);

            const inicioAnterior =
                adicionarDias(inicioSemana, -7);

            const proximoInicio =
                adicionarDias(inicioSemana, 7);

            const pertenceAoPeriodo = (
                tarefa,
                inicio,
                fim
            ) => (
                tarefa.dia &&
                tarefa.dia >= inicio &&
                tarefa.dia < fim
            );

            const semanaAtual = concluidos.filter(
                tarefa => pertenceAoPeriodo(
                    tarefa,
                    inicioSemana,
                    proximoInicio
                )
            );

            const semanaAnterior = concluidos.filter(
                tarefa => pertenceAoPeriodo(
                    tarefa,
                    inicioAnterior,
                    inicioSemana
                )
            );

            // DATAS CONSECUTIVAS

            const datas = new Set(
    concluidos
        .map(item => item.dia)
        .filter(Boolean)
);

            let cursor = datas.has(hoje)
                ? hoje
                : adicionarDias(hoje, -1);

            let sequenciaDias = 0;

            while (datas.has(cursor)) {
                sequenciaDias++;

                cursor = adicionarDias(
                    cursor,
                    -1
                );
            }

            // PROGRESSO POR DISCIPLINA

            const porDisciplina = new Map();

            for (const compromisso of compromissos) {

                const nome =
    compromisso.disciplina ||
    "Sem disciplina";

                const registro =
                    porDisciplina.get(nome) || {
                        nome,
                        total: 0,
                        concluidas: 0
                    };

                registro.total++;

               if (compromisso.concluido === true) {
                registro.concluidas++;
                }

                porDisciplina.set(nome, registro);
            }

            const disciplinas = [
                ...porDisciplina.values()
            ].map(disciplina => ({

                ...disciplina,

                percentual: disciplina.total
                    ? Math.round(
                        disciplina.concluidas *
                        100 /
                        disciplina.total
                    )
                    : 0

            })).sort(
                (a, b) =>
                    a.nome.localeCompare(
                        b.nome,
                        "pt-BR"
                    )
            );

            const arredondar = valor =>
                Number(valor.toFixed(1));

            return res.json({

                sucesso: true,

                resumo: {

                    compromissosConcluidos:
    concluidos.length,

tiposConcluidos: {

    tarefas: concluidos.filter(
        item => item.tipo === "tarefa"
    ).length,

    metas: concluidos.filter(
        item => item.tipo === "meta"
    ).length,

    eventos: concluidos.filter(
        item => item.tipo === "evento"
    ).length

},

                    variacaoSemanal:
                        semanaAtual.length -
                        semanaAnterior.length,

                    horasPlanejadasConcluidas:
                        arredondar(
                            concluidos.filter(
    item => item.tipo === "tarefa"
).reduce(
                                (total, tarefa) =>
                                    total +
                                    horasPrevistas(tarefa),
                                0
                            )
                        ),

                    horasSemana:
                        arredondar(
                            semanaAtual.filter(    item => item.tipo === "tarefa").reduce(
                                (total, tarefa) =>
                                    total +
                                    horasPrevistas(tarefa),
                                0
                            )
                        ),

                    sequenciaDias,

                    disciplinas

                }

            });

        } catch (erro) {

            console.error(
                "Erro ao carregar progresso:",
                erro
            );

            return res.status(500).json({
                sucesso: false,
                erro: "Não foi possível carregar o progresso."
            });

        }

    });

};