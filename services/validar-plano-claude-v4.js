const validarV3 = require(
    "./validar-plano-claude"
);

module.exports = function validarV4(
    plano,
    dados,
    configuracao
) {
    if (
        !plano ||
        plano.versao !== 4 ||
        !Array.isArray(plano.sessoes)
    ) {
        return {
            valido: false,
            erros: ["Plano V4 invalido."],
            alertas: []
        };
    }

    const base = validarV3(
        { ...plano, versao: 3 },
        dados,
        configuracao
    );

    const erros = [...base.erros];

    const preenchido = valor =>
        typeof valor === "string" &&
        valor.trim().length >= 5;

    if (
        !Array.isArray(plano.metasSemanais) ||
        plano.metasSemanais.length === 0 ||
        !plano.metasSemanais.every(preenchido)
    ) {
        erros.push(
            "Metas semanais incompletas."
        );
    }

    const acompanhamento =
        plano.acompanhamento || {};

    for (const campo of [
        "comoRegistrar",
        "quandoRevisar",
        "seHouverDificuldade"
    ]) {
        if (!preenchido(acompanhamento[campo])) {
            erros.push(
                `Acompanhamento incompleto: ${campo}.`
            );
        }
    }

    plano.sessoes.forEach((sessao, indice) => {
        const numero = indice + 1;

        if (
            !preenchido(sessao.objetivoAprendizagem) ||
            !preenchido(sessao.criterioSucesso)
        ) {
            erros.push(
                `Sessao ${numero}: objetivo ou criterio incompleto.`
            );
        }

        if (
            !Array.isArray(sessao.recursos) ||
            sessao.recursos.length === 0 ||
            !sessao.recursos.every(preenchido)
        ) {
            erros.push(
                `Sessao ${numero}: recursos invalidos.`
            );
        }

        const roteiro = sessao.roteiro;

        if (
            !Array.isArray(roteiro) ||
            roteiro.length < 2 ||
            roteiro.length > 4 ||
            roteiro.some(
                etapa =>
                    !Number.isInteger(etapa.minutos) ||
                    etapa.minutos <= 0 ||
                    !preenchido(etapa.instrucao)
            ) ||
            roteiro.reduce(
                (total, etapa) =>
                    total + Number(etapa.minutos || 0),
                0
            ) !== sessao.duracaoMin
        ) {
            erros.push(
                `Sessao ${numero}: roteiro metodologico invalido.`
            );
        }

        const sugestao =
            sessao.sugestaoQuestoes;

        if (
            !sugestao ||
            sugestao.disciplina !== sessao.disciplina ||
            !preenchido(sugestao.conteudo) ||
            !["facil", "media", "dificil"].includes(
                sugestao.dificuldade
            ) ||
            !Number.isInteger(sugestao.quantidade) ||
            sugestao.quantidade < 1 ||
            sugestao.quantidade > 10
        ) {
            erros.push(
                `Sessao ${numero}: recomendacao de questoes invalida.`
            );
        }

        if (
            Object.prototype.hasOwnProperty.call(
                sessao,
                "questoes"
            )
        ) {
            erros.push(
                `Sessao ${numero}: o Claude nao deve gerar questoes.`
            );
        }
    });

    return {
        ...base,
        valido: erros.length === 0,
        erros
    };
};