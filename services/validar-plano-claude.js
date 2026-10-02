// ==========================================
// ROTA DO SUCESSO
// VALIDADOR DO PLANO CLAUDE V3
// ==========================================

const DIAS = {
    Seg: 1,
    Ter: 2,
    Qua: 3,
    Qui: 4,
    Sex: 5,
    Sab: 6,
    "Sáb": 6,
    Dom: 7
};

function minutos(hora) {

    const resultado =
        /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/
            .exec(String(hora || ""));

    if (!resultado) return null;

    return Number(resultado[1]) * 60 +
           Number(resultado[2]);
}

function verificarData(valor) {

    if (
        typeof valor !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(valor)
    ) {
        return null;
    }

    const data = new Date(valor + "T00:00:00Z");

    if (
        Number.isNaN(data.getTime()) ||
        data.toISOString().slice(0, 10) !== valor
    ) {
        return null;
    }

    return data.getUTCDay() || 7;
}


// ==========================================
// VALIDAÇÃO PRINCIPAL
// ==========================================

function validarPlanoClaude(
    plano,
    dados,
    configuracao
) {

    const erros = [];
    const alertas = [];

    const sessoes = plano?.sessoes;
    const distribuicao = plano?.distribuicao;

    if (
        plano?.versao !== 3 ||
        !Array.isArray(sessoes) ||
        !Array.isArray(distribuicao)
    ) {

        return {
            valido: false,
            erros: [
                "Estrutura principal do plano inválida."
            ],
            alertas: []
        };

    }

    if (sessoes.length === 0) {
        erros.push("O plano não possui sessões.");
    }

    if (
        typeof plano.resumo !== "string" ||
        !plano.diagnostico ||
        !Array.isArray(plano.recomendacoes)
    ) {

        erros.push(
            "Diagnóstico, resumo ou recomendações inválidos."
        );

    }


    const disciplinasPermitidas =
        new Set(configuracao.disciplinas);

    const diasDisponiveis =
        new Set(
            (
                dados.tempoDisponivel
                    ?.diasDisponiveis || []
            )
                .map(dia => DIAS[dia])
                .filter(Boolean)
        );

    if (
        dados.tempoDisponivel
            ?.fimSemana === "somenteSabado"
    ) {
        diasDisponiveis.add(6);
    }

    const limiteDiario =
        Number(
            dados.tempoDisponivel
                ?.minutosPorDia
        );

    const compromissos =
        dados.rotinaDiaria?.compromissos || [];

    const intervalos = new Map();
    const minutosPorData = {};
    const minutosPorDisciplina = {};


    // ======================================
    // VERIFICAR CADA SESSÃO
    // ======================================

    sessoes.forEach((sessao, indice) => {

        const numero = indice + 1;

        if (
            !sessao ||
            typeof sessao !== "object"
        ) {

            erros.push(
                `Sessão ${numero}: registro inválido.`
            );

            return;

        }

        const dia = verificarData(
            sessao.data
        );

        const inicio = minutos(
            sessao.horaInicio
        );

        const fim = minutos(
            sessao.horaFim
        );


        // Data e dias disponíveis.

        if (dia === null) {

            erros.push(
                `Sessão ${numero}: data inválida.`
            );

        } else {

            if (
                sessao.data <
                    configuracao.dataInicio ||
                sessao.data >
                    configuracao.dataFim
            ) {

                erros.push(
                    `Sessão ${numero}: fora do período.`
                );

            }

            if (
                diasDisponiveis.size > 0 &&
                !diasDisponiveis.has(dia)
            ) {

                erros.push(
                    `Sessão ${numero}: dia indisponível.`
                );

            }

        }


        // Disciplina e conteúdo.

        if (
            !disciplinasPermitidas.has(
                sessao.disciplina
            )
        ) {

            erros.push(
                `Sessão ${numero}: disciplina não cadastrada.`
            );

        }

        [
            "conteudo",
            "metodologia",
            "atividade"
        ].forEach(campo => {

            if (
                typeof sessao[campo] !== "string" ||
                !sessao[campo].trim()
            ) {

                erros.push(
                    `Sessão ${numero}: ${campo} inválido.`
                );

            }

        });


        // Horários e duração.

        if (
            inicio === null ||
            fim === null ||
            fim <= inicio
        ) {

            erros.push(
                `Sessão ${numero}: horário inválido.`
            );

            return;

        }

        if (
            !Number.isInteger(sessao.duracaoMin) ||
            sessao.duracaoMin !== fim - inicio
        ) {

            erros.push(
                `Sessão ${numero}: duração incorreta.`
            );

        }


        // Prioridade.

        if (
            !["alta", "media", "normal"].includes(
                sessao.prioridade
            )
        ) {

            erros.push(
                `Sessão ${numero}: prioridade inválida.`
            );

        }


        // Sugestões de questões.

        const questoes =
            sessao.sugestaoQuestoes;

        if (
            !questoes ||
            questoes.disciplina !==
                sessao.disciplina ||
            typeof questoes.conteudo !== "string" ||
            !questoes.conteudo.trim() ||
            !["facil", "media", "dificil"].includes(
                questoes.dificuldade
            ) ||
            !Number.isInteger(
                questoes.quantidade
            ) ||
            questoes.quantidade <= 0
        ) {

            erros.push(
                `Sessão ${numero}: sugestão de questões inválida.`
            );

        }


        // Sobreposição entre sessões.

        const anteriores =
            intervalos.get(sessao.data) || [];

        if (
            anteriores.some(
                item =>
                    inicio < item.fim &&
                    fim > item.inicio
            )
        ) {

            erros.push(
                `Sessão ${numero}: sobreposição entre sessões.`
            );

        }

        anteriores.push({ inicio, fim });

        intervalos.set(
            sessao.data,
            anteriores
        );


        // Conflitos com a rotina diária.

        compromissos
            .filter(
                item =>
                    Number(item.diaSemana) === dia &&
                    item.bloqueiaEstudo === true
            )
            .forEach(item => {

                const ocupadoInicio =
                    minutos(item.horaInicio);

                const ocupadoFim =
                    minutos(item.horaFim);

                if (
                    ocupadoInicio !== null &&
                    ocupadoFim !== null &&
                    inicio < ocupadoFim &&
                    fim > ocupadoInicio
                ) {

                    erros.push(
                        `Sessão ${numero}: conflito com a rotina.`
                    );

                }

            });


        // Contabilizar tempo.

        minutosPorData[sessao.data] =
            (minutosPorData[sessao.data] || 0) +
            (fim - inicio);

        minutosPorDisciplina[sessao.disciplina] =
            (
                minutosPorDisciplina[
                    sessao.disciplina
                ] || 0
            ) + (fim - inicio);

    });


    // ======================================
    // VERIFICAR TEMPO DIÁRIO
    // ======================================

    Object.entries(
        minutosPorData
    ).forEach(([data, total]) => {

        if (
            Number.isFinite(limiteDiario) &&
            limiteDiario > 0 &&
            total > limiteDiario
        ) {

            erros.push(
                `${data}: ultrapassou o limite diário.`
            );

        }

    });


    // ======================================
    // CONFERIR DISTRIBUIÇÃO DECLARADA
    // ======================================

    const distribuicaoInformada = {};

    distribuicao.forEach(item => {

        if (
            !disciplinasPermitidas.has(
                item.disciplina
            ) ||
            !Number.isInteger(item.minutos) ||
            item.minutos < 0
        ) {

            erros.push(
                "Distribuição de disciplinas inválida."
            );

            return;

        }

        distribuicaoInformada[item.disciplina] =
            (
                distribuicaoInformada[
                    item.disciplina
                ] || 0
            ) + item.minutos;

    });

    const todasDisciplinas =
        new Set([
            ...Object.keys(
                minutosPorDisciplina
            ),
            ...Object.keys(
                distribuicaoInformada
            )
        ]);

    todasDisciplinas.forEach(disciplina => {

        if (
            (minutosPorDisciplina[disciplina] || 0) !==
            (distribuicaoInformada[disciplina] || 0)
        ) {

            erros.push(
                `Distribuição de ${disciplina} não corresponde às sessões.`
            );

        }

    });

// ======================================
// VALIDAÇÃO PEDAGÓGICA
// ======================================

const estudadas = new Set(
    sessoes.map(item => item?.disciplina)
);

const disciplinasComDificuldade = [
    ...new Set(
        (dados.dificuldades || [])
            .map(item => item?.disciplina)
            .filter(
                nome =>
                    nome &&
                    disciplinasPermitidas.has(nome)
            )
    )
];

const semCobertura =
    disciplinasComDificuldade.filter(
        nome => !estudadas.has(nome)
    );

// Havendo sessões suficientes, toda
// disciplina com dificuldade deve aparecer.

const coberturaObrigatoria =
    sessoes.length >=
    disciplinasComDificuldade.length;

semCobertura.forEach(disciplina => {

    const mensagem =
        `Dificuldade declarada sem sessão: ${disciplina}.`;

    if (coberturaObrigatoria) {
        erros.push(mensagem);
    } else {
        alertas.push(mensagem);
    }

});

// Evitar dois alertas para o mesmo problema.

const naoEstudada =
    dados.disciplinaNaoEstudada;

if (
    naoEstudada &&
    !estudadas.has(naoEstudada) &&
    !disciplinasComDificuldade.includes(
        naoEstudada
    )
) {

    alertas.push(
        `Disciplina pouco estudada ficou de fora: ${naoEstudada}.`
    );

}

    return {

        valido:
            erros.length === 0,

        erros,

        alertas,

        estatisticas: {

            totalSessoes:
                sessoes.length,

            minutosPorDisciplina,

            minutosPorData

        }

    };

}


module.exports =
    validarPlanoClaude;