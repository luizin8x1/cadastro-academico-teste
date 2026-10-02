const v3 = require("./schema-plano-claude");

const schema = structuredClone(v3);

const texto = { type: "string" };

const lista = {
    type: "array",
    items: texto
};

schema.properties.versao.const = 4;

const sessao = schema.properties.sessoes.items;

Object.assign(sessao.properties, {

    objetivoAprendizagem: texto,

    roteiro: {
        type: "array",
        items: {
            type: "object",
            additionalProperties: false,

            properties: {
                minutos: {
                    type: "integer"
                },
                instrucao: texto
            },

            required: [
                "minutos",
                "instrucao"
            ]
        }
    },

    recursos: lista,

    criterioSucesso: texto,

    questoes: {
        type: "array",

        items: {
            type: "object",
            additionalProperties: false,

            properties: {
                enunciado: texto,

                alternativas: lista,

                gabarito: {
                    type: "string",
                    enum: ["A", "B", "C", "D"]
                },

                explicacao: texto,

                dificuldade: {
                    type: "string",
                    enum: [
                        "facil",
                        "media",
                        "dificil"
                    ]
                }
            },

            required: [
                "enunciado",
                "alternativas",
                "gabarito",
                "explicacao",
                "dificuldade"
            ]
        }
    }

});

sessao.required.push(
    "objetivoAprendizagem",
    "roteiro",
    "recursos",
    "criterioSucesso",
    "questoes"
);

schema.properties.metasSemanais = lista;

schema.properties.acompanhamento = {
    type: "object",
    additionalProperties: false,

    properties: {
        comoRegistrar: texto,
        quandoRevisar: texto,
        seHouverDificuldade: texto
    },

    required: [
        "comoRegistrar",
        "quandoRevisar",
        "seHouverDificuldade"
    ]
};

schema.required.push(
    "metasSemanais",
    "acompanhamento"
);
// O Claude indica a pratica, mas nao cria exercicios.
delete sessao.properties.questoes;

sessao.required =
    sessao.required.filter(
        campo => campo !== "questoes"
    );

module.exports = schema;