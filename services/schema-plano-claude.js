// ==========================================
// ROTA DO SUCESSO
// ESQUEMA DE RESPOSTA DO CLAUDE - VERSÃO 3
// ==========================================

const texto = {
    type: "string"
};

const listaTextos = {
    type: "array",
    items: texto
};


// ==========================================
// DIAGNÓSTICO PEDAGÓGICO
// ==========================================

const diagnostico = {

    type: "object",

    additionalProperties: false,

    properties: {

        dificuldadesDeclaradas: listaTextos,

        prioridades: listaTextos,

        limitacoes: listaTextos

    },

    required: [
        "dificuldadesDeclaradas",
        "prioridades",
        "limitacoes"
    ]

};


// ==========================================
// DISTRIBUIÇÃO DO TEMPO
// ==========================================

const distribuicao = {

    type: "object",

    additionalProperties: false,

    properties: {

        disciplina: texto,

        minutos: {
            type: "integer"
        },

        justificativa: texto

    },

    required: [
        "disciplina",
        "minutos",
        "justificativa"
    ]

};


// ==========================================
// SUGESTÃO DE EXERCÍCIOS
// ==========================================

const sugestaoQuestoes = {

    type: "object",

    additionalProperties: false,

    properties: {

        disciplina: texto,

        conteudo: texto,

        dificuldade: {

            type: "string",

            enum: [
                "facil",
                "media",
                "dificil"
            ]

        },

        quantidade: {
            type: "integer"
        }

    },

    required: [
        "disciplina",
        "conteudo",
        "dificuldade",
        "quantidade"
    ]

};


// ==========================================
// SESSÃO DE ESTUDOS
// ==========================================

const sessao = {

    type: "object",

    additionalProperties: false,

    properties: {

        data: texto,

        horaInicio: texto,

        horaFim: texto,

        disciplina: texto,

        conteudo: texto,

        metodologia: texto,

        atividade: texto,

        duracaoMin: {
            type: "integer"
        },

        prioridade: {

            type: "string",

            enum: [
                "alta",
                "media",
                "normal"
            ]

        },

        sugestaoQuestoes

    },

    required: [
        "data",
        "horaInicio",
        "horaFim",
        "disciplina",
        "conteudo",
        "metodologia",
        "atividade",
        "duracaoMin",
        "prioridade",
        "sugestaoQuestoes"
    ]

};


// ==========================================
// ESTRUTURA COMPLETA DO PLANO
// ==========================================

const schemaPlanoClaude = {

    type: "object",

    additionalProperties: false,

    properties: {

        versao: {
            type: "integer",
            const: 3
        },

        resumo: texto,

        diagnostico,

        distribuicao: {

            type: "array",

            items: distribuicao

        },

        sessoes: {

            type: "array",

            items: sessao

        },

        recomendacoes: listaTextos

    },

    required: [
        "versao",
        "resumo",
        "diagnostico",
        "distribuicao",
        "sessoes",
        "recomendacoes"
    ]

};


module.exports =
    schemaPlanoClaude;