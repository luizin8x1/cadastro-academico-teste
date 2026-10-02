require("dotenv").config();

const { Pool } = require("pg");
const Anthropic = require("@anthropic-ai/sdk");


const anthropic =
    new Anthropic({
        apiKey:
            process.env.ANTHROPIC_API_KEY
    });


const pool =
    new Pool({

        host:
            process.env.DB_HOST,

        port:
            process.env.DB_PORT || 5432,

        database:
            process.env.DB_NAME,

        user:
            process.env.DB_USER,

        password:
            process.env.DB_PASSWORD,

        ssl: {
            rejectUnauthorized: false
        }

    });


const VERSAO =
    process.env.MATRIZ_ENEM_VERSAO ||
    "2026";


const AREAS = [

    "Linguagens",

    "Matemática",

    "Ciências da Natureza",

    "Ciências Humanas",

    "Redação"

];


const URL_OFICIAL =
    "https://www.gov.br/inep/pt-br/centrais-de-conteudo/acervo-linha-editorial/publicacoes-institucionais/avaliacoes-e-exames-da-educacao-basica/matrizes-de-referencia-enem/";


// ==========================================
// VALIDAR ORIGEM DA REFERÊNCIA
// ==========================================

function fonteOficial(url) {

    try {

        const endereco =
            new URL(url);

        return (

            endereco.protocol ===
                "https:" &&

            (
                endereco.hostname ===
                    "www.gov.br" &&

                endereco.pathname.startsWith(
                    "/inep/"
                )

                ||

                endereco.hostname ===
                    "download.inep.gov.br"

            )

        );

    } catch {

        return false;

    }

}


// ==========================================
// PESQUISAR UMA ÁREA
// ==========================================

async function pesquisarArea(area) {

   const parametrosPesquisa = {

            model:
                process.env.CLAUDE_PLANO_MODEL ||
                "claude-sonnet-4-6",

            max_tokens: 2500,

            temperature: 0,

            tools: [

                {
                    type:
                        "web_search_20250305",

                    name:
                        "web_search",

                    max_uses: 2,

                    allowed_domains: [
                        "gov.br",
                        "inep.gov.br"
                    ]
                }

            ],

            messages: [

                {
                    role: "user",

                    content: `

Consulte a Matriz de Referência do
ENEM disponibilizada pelo Inep.

Fonte oficial:
${URL_OFICIAL}

Área:
${area}

Pesquise a publicação e, quando
acessível, seu documento integral.

Prepare uma síntese pedagógica
com aproximadamente 2500 caracteres.

Inclua:

1. Competências relevantes.
2. Habilidades identificáveis.
3. Objetos de conhecimento.
4. Conteúdos e abordagens úteis
   para planejar estudos.
5. Recomendações para exercícios.

Não invente códigos de habilidades.

Somente associe códigos a
competências quando conseguir
verificá-los no documento oficial.

Caso o documento completo
não esteja acessível, informe
explicitamente a limitação.

Não utilize fontes não oficiais.

Responda em português.

`
                }

            ]

                };


let resposta =
    await anthropic.messages.create(
        parametrosPesquisa
    );


const blocosPesquisa = [
    ...resposta.content
];


let totalTokensEntrada =
    resposta.usage?.input_tokens || 0;

let totalTokensSaida =
    resposta.usage?.output_tokens || 0;

let totalBuscas =
    resposta.usage
        ?.server_tool_use
        ?.web_search_requests || 0;


    // ==========================================
// CONTINUAR PESQUISAS PAUSADAS
// ==========================================

const mensagensPesquisa = [
    ...parametrosPesquisa.messages
];

let continuacoes = 0;

const LIMITE_CONTINUACOES = 2;


while (
    resposta.stop_reason === "pause_turn" &&
    continuacoes < LIMITE_CONTINUACOES
) {

    console.log(
        `Claude pausou a pesquisa de ${area}. Continuando...`
    );


    mensagensPesquisa.push({

        role: "assistant",

        content:
            resposta.content

    });


    resposta =
        await anthropic.messages.create({

            ...parametrosPesquisa,

            messages:
                mensagensPesquisa

        });


    blocosPesquisa.push(
        ...resposta.content
    );


    totalTokensEntrada +=
        resposta.usage?.input_tokens || 0;

    totalTokensSaida +=
        resposta.usage?.output_tokens || 0;

    totalBuscas +=
        resposta.usage
            ?.server_tool_use
            ?.web_search_requests || 0;


    continuacoes++;

}


// ==========================================
// DIAGNÓSTICO DE ERROS
// ==========================================

const errosBusca =
    blocosPesquisa

        .filter(
            bloco =>
                bloco.type ===
                    "web_search_tool_result" &&

                !Array.isArray(
                    bloco.content
                ) &&

                bloco.content?.error_code
        )

        .map(
            bloco =>
                bloco.content.error_code
        );


if (
    errosBusca.length > 0
) {

    console.log(
        "Erros da pesquisa:",
        errosBusca
    );

}


if (
    resposta.stop_reason !== "end_turn"
) {

    console.log(
        "Motivo da parada:",
        resposta.stop_reason
    );


    console.log(
        "Tipos de blocos recebidos:",
        blocosPesquisa.map(
            bloco => bloco.type
        )
    );


    throw new Error(
        `Pesquisa não concluída: ${area}. Motivo: ${resposta.stop_reason}`
    );

}


    const fontes =
    blocosPesquisa

            .filter(
                bloco =>
                    bloco.type === "text"
            )

            .flatMap(
                bloco =>
                    bloco.citations || []
            )

            .filter(
                citacao =>
                    citacao.url &&
                    fonteOficial(
                        citacao.url
                    )
            )

            .map(
                citacao => ({

                    titulo:
                        citacao.title || "",

                    url:
                        citacao.url

                })
            );


    const fontesUnicas = [

        ...new Map(

            fontes.map(
                fonte => [
                    fonte.url,
                    fonte
                ]
            )

        ).values()

    ];


    if (
        fontesUnicas.length === 0
    ) {

        throw new Error(
            `Nenhuma fonte oficial citada: ${area}`
        );

    }


    const ultimoResultadoBusca =
    blocosPesquisa.findLastIndex(
            bloco =>
                bloco.type ===
                    "web_search_tool_result"
        );


    const sintese =
    blocosPesquisa

            .slice(
                ultimoResultadoBusca + 1
            )

            .filter(
                bloco =>
                    bloco.type === "text"
            )

            .map(
                bloco =>
                    bloco.text
            )

            .join("\n")

            .trim();


    if (
        sintese.length < 100
    ) {

        throw new Error(
            `Síntese insuficiente: ${area}`
        );

    }


    return {

        sintese,

        fontes:
            fontesUnicas,

        tokensEntrada:
            totalTokensEntrada,

        tokensSaida:
            totalTokensSaida,


        buscas:
           totalBuscas

    };

}


// ==========================================
// EXECUTAR PREPARAÇÃO
// ==========================================

async function executar() {

    for (
        const area of AREAS
    ) {

        const existente =
            await pool.query(
                `
                SELECT id

                FROM matriz_enem_cache

                WHERE versao = $1
                  AND area = $2
                `,
                [
                    VERSAO,
                    area
                ]
            );


        if (
            existente.rows.length > 0
        ) {

            console.log(
                `Já cadastrada: ${area}`
            );

            continue;

        }


        console.log(
            `Pesquisando: ${area}`
        );


        const pesquisa =
            await pesquisarArea(
                area
            );


        await pool.query(
            `
            INSERT INTO matriz_enem_cache
            (
                versao,
                area,
                sintese,
                fontes,
                tokens_entrada,
                tokens_saida,
                buscas_realizadas
            )

            VALUES
            (
                $1,
                $2,
                $3,
                $4::jsonb,
                $5,
                $6,
                $7
            )

            ON CONFLICT
                (versao, area)

            DO NOTHING
            `,
            [

                VERSAO,

                area,

                pesquisa.sintese,

                JSON.stringify(
                    pesquisa.fontes
                ),

                pesquisa.tokensEntrada,

                pesquisa.tokensSaida,

                pesquisa.buscas

            ]
        );


        console.log(
            `Referência cadastrada: ${area}`
        );

    }

}


// ==========================================
// INICIAR
// ==========================================

executar()

    .catch(
        erro => {

            console.error(
                "Erro:",
                erro.message
            );

            process.exitCode = 1;

        }
    )

    .finally(
        async () => {

            await pool.end();

        }
    );