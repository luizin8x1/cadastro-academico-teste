const PDFDocument = require("pdfkit");
const fs = require("node:fs");
const path = require("node:path");

function lerJson(valor, vazio) {

    if (valor == null) return vazio;

    if (typeof valor === "string") {

        try {
            return JSON.parse(valor);
        }
        catch {
            return vazio;
        }

    }

    return valor;

}

function formatarData(valor) {

    const data = String(
        valor || ""
    ).slice(0, 10);

    return /^\d{4}-\d{2}-\d{2}$/.test(data)
        ? `${data.slice(8, 10)}/${data.slice(5, 7)}/${data.slice(0, 4)}`
        : data;

}

module.exports = function gerarPdfV4(
    plano,
    itens
) {

    return new Promise(
        (resolve, reject) => {

            const doc = new PDFDocument({

                size: "A4",
                margin: 48,
                bufferPages: true,

                info: {
                    Title:
                        "Guia pedagógico Rota do Sucesso",

                    Author:
                        "Rota do Sucesso"
                }

            });

            const partes = [];

            doc.on(
                "data",
                parte => partes.push(parte)
            );

            doc.on(
                "error",
                reject
            );

            doc.on(
                "end",
                () => resolve(
                    Buffer.concat(partes)
                )
            );

            const azul = "#12366B";
            const cinza = "#42536A";

            const diagnostico = lerJson(
                plano.diagnostico_ia,
                {}
            );

            const distribuicao = lerJson(
                plano.distribuicao_ia,
                []
            );

            const recomendacoes = lerJson(
                plano.recomendacoes_ia,
                []
            );

            const largura =
                doc.page.width - 96;

            const texto = valor =>
                String(
                    valor == null
                        ? ""
                        : valor
                );


            // ==================================
            // COMPONENTES DO DOCUMENTO
            // ==================================

            function secao(nome) {

                if (doc.y > 710) {
                    doc.addPage();
                }

                doc
                    .moveDown(0.7)
                    .font("Helvetica-Bold")
                    .fontSize(14)
                    .fillColor(azul)
                    .text(
                        nome,
                        { width: largura }
                    );

                doc.moveDown(0.35);

            }

            function paragrafo(
                rotulo,
                valor
            ) {

                if (
                    valor == null ||
                    valor === ""
                ) {
                    return;
                }

                doc
                    .font("Helvetica-Bold")
                    .fontSize(9.5)
                    .fillColor(azul)
                    .text(
                        rotulo,
                        { continued: true }
                    );

                doc
                    .font("Helvetica")
                    .fillColor("#1F2937")
                    .text(
                        " " + texto(valor),
                        { width: largura }
                    );

                doc.moveDown(0.3);

            }

            function lista(valores) {

                if (
                    !Array.isArray(valores) ||
                    !valores.length
                ) {

                    doc
                        .font("Helvetica-Oblique")
                        .fontSize(9.5)
                        .text("Não informado.");

                    return;

                }

                for (const valor of valores) {

                    doc
                        .font("Helvetica")
                        .fontSize(9.5)
                        .fillColor("#1F2937")
                        .text(
                            "- " + texto(valor),
                            {
                                width: largura,
                                indent: 8
                            }
                        );

                }

            }

            // ==================================
            // CABECALHO DO MODELO COMPACTO
            // ==================================

            const logo = [
                path.join(
                    __dirname, "..", "public",
                    "img", "logo_1.png"
                ),
                path.join(
                    __dirname, "..", "public",
                    "img", "logo-rota-do-sucesso.png.png"
                )
            ].find(arquivo => fs.existsSync(arquivo));

            doc.roundedRect(48, 35, largura, 96, 13)
                .fill("#112B60");

            if (logo) {
                try {
                    doc.image(logo, 62, 47, {
                        fit: [107, 65]
                    });
                } catch {
                    doc.font("Helvetica-Bold")
                        .fontSize(13)
                        .fillColor("#FFFFFF")
                        .text(
                            "ROTA DO SUCESSO",
                            62, 63,
                            { width: 115 }
                        );
                }
            } else {
                doc.font("Helvetica-Bold")
                    .fontSize(13)
                    .fillColor("#FFFFFF")
                    .text(
                        "ROTA DO SUCESSO",
                        62, 63,
                        { width: 115 }
                    );
            }

            doc.font("Helvetica-Bold")
                .fontSize(18)
                .fillColor("#FFFFFF")
                .text(
                    "PLANO DE ESTUDOS",
                    192, 52,
                    { width: largura - 155 }
                );

            doc.font("Helvetica")
                .fontSize(8.3)
                .text(
                    "Sua rota personalizada para estudar com mais organização.",
                    192, 79,
                    { width: largura - 155 }
                );

            doc.roundedRect(192, 104, 123, 17, 8)
                .fill("#F6C915");

            doc.font("Helvetica-Bold")
                .fontSize(8)
                .fillColor(azul)
                .text(
                    `PLANO ${String(
                        plano.tipo_planejamento || "semanal"
                    ).toUpperCase()}`,
                    198, 108,
                    {
                        width: 111,
                        align: "center"
                    }
                );

            doc.roundedRect(48, 144, largura, 62, 10)
                .fillAndStroke("#FFFFFF", "#DEE7F3");

            doc.font("Helvetica-Bold")
                .fontSize(8)
                .fillColor("#245FE9")
                .text(
                    "ESTUDANTE",
                    62, 152,
                    { width: 190 }
                );

            doc.font("Helvetica-Bold")
                .fontSize(13)
                .fillColor(azul)
                .text(
                    plano.aluno_nome || "Estudante",
                    62, 168,
                    { width: 260 }
                );

            doc.font("Helvetica")
                .fontSize(8.5)
                .fillColor(cinza)
                .text(
                    [
                        plano.serie,
                        plano.rede_ensino
                    ].filter(Boolean).join(" - "),
                    326, 172,
                    { width: largura - 290 }
                );

            const totalMinutos = itens.reduce(
                (soma, item) =>
                    soma + Number(item.duracao_min || 0),
                0
            );

            const totalRecomendado = itens.reduce(
                (soma, item) => {
                    const indicacao = lerJson(
                        item.sugestao_questoes_ia,
                        {}
                    );

                    return soma +
                        Number(indicacao.quantidade || 0);
                },
                0
            );

            const indicadores = [
                ["SESSÕES", String(itens.length)],
                [
                    "TEMPO PLANEJADO",
                    `${totalMinutos / 60}h`
                ],
                [
                    "PERÍODO",
                    `${formatarData(plano.data_inicio)} a ${formatarData(plano.data_fim)}`
                ]
            ];

            const espacamento = 8;

            const larguraIndicador =
                (largura - espacamento * 2) / 3;

            indicadores.forEach(
                ([rotulo, valor], i) => {
                    const x = 48 + i *
                        (larguraIndicador + espacamento);

                    doc.roundedRect(
                        x, 223,
                        larguraIndicador,
                        48, 8
                    ).fillAndStroke(
                        "#F1F6FD",
                        "#DEE7F3"
                    );

                    doc.font("Helvetica-Bold")
                        .fontSize(7)
                        .fillColor(cinza)
                        .text(
                            rotulo,
                            x + 9, 231,
                            {
                                width:
                                    larguraIndicador - 18
                            }
                        );

                    doc.font("Helvetica-Bold")
                        .fontSize(
                            i === 2 ? 8.4 : 12
                        )
                        .fillColor(azul)
                        .text(
                            valor,
                            x + 9, 245,
                            {
                                width:
                                    larguraIndicador - 18
                            }
                        );
                }
            );

            doc.y = 280;

            if (totalRecomendado) {
                doc.font("Helvetica")
                    .fontSize(8)
                    .fillColor(cinza)
                    .text(
                        `${totalRecomendado} exercícios recomendados; seleção pelo sistema`,
                        48, 285,
                        {
                            width: largura,
                            align: "right"
                        }
                    );
            }

            doc.y = 293;

                        // ==================================
            // CRONOGRAMA COMPACTO V4
            // ==================================

            const baseX = 48;
            const baseW = largura;
            const limite = doc.page.height - 65;
            const azulClaro = "#F1F6FD";
            const borda = "#DEE7F3";

            function altura(
                valor,
                tamanho = 8.5,
                larguraTexto = baseW - 34,
                negrito = false
            ) {
                doc.font(
                    negrito
                        ? "Helvetica-Bold"
                        : "Helvetica"
                ).fontSize(tamanho);

                return doc.heightOfString(
                    String(valor || ""),
                    {
                        width: larguraTexto,
                        lineGap: 1
                    }
                );
            }

            function corrigirInstrucao(valor, disciplina) {

    const instrucao = String(valor || "");

    // Evitar caracteres matematicos incompatíveis
    // com a fonte padrao do PDF.

    if (
        disciplina === "Física" &&
        instrucao.startsWith(
            "No caderno, escreva os seguintes conceitos"
        )
    ) {
        return (
            "Registre os conceitos de posicao, " +
            "deslocamento (posicao final menos posicao inicial) " +
            "e velocidade media (deslocamento dividido pelo tempo), " +
            "com suas unidades. Depois, registre as tres Leis " +
            "de Newton: inercia, F = m x a e acao e reacao. " +
            "Inclua um exemplo cotidiano para cada lei."
        );
    }

    // Alguns roteiros antigos mencionam exercicios
    // e gabaritos que ainda nao existem no sistema.

    if (
        /duas quest[oõ]es|gabarito|quest[oõ]es propostas/i
            .test(instrucao)
    ) {
        return (
            "Revise o conteudo estudado e formule duas " +
            "perguntas para responder sem consultar as " +
            "anotacoes. Se o sistema disponibilizar " +
            "exercicios, resolva os recomendados " +
            "e registre suas dificuldades."
        );
    }

    return instrucao;
}


            function prepararCartao(item) {
                const detalhes = lerJson(
                    item.sugestao_questoes_ia,
                    {}
                );

                const wTexto = baseW - 34;

                const campos = [
                    [
                        "O QUE ESTUDAR",
                        item.conteudo || item.conteudo_ia
                    ],
                    [
                        "OBJETIVO DE APRENDIZAGEM",
                        detalhes.objetivoAprendizagem
                    ],
                    [
                        "METODOLOGIA RECOMENDADA",
                        item.metodo_estudo ||
                        item.metodologia_detalhada_ia
                    ]
                ].filter(
                    ([, valor]) => Boolean(valor)
                );

                const etapas = Array.isArray(
    detalhes.roteiro
)
    ? detalhes.roteiro.map(etapa => ({
        ...etapa,
        instrucao: corrigirInstrucao(
            etapa.instrucao,
            item.disciplina
        )
    }))
    : [];

                const titulo =
                    detalhes.tituloSessao ||
                    String(
                        item.conteudo ||
                        item.conteudo_ia ||
                        item.disciplina
                    ).split(":")[0];

                let h = 50 + altura(
                    titulo,
                    11,
                    wTexto,
                    true
                );

                for (const [, valor] of campos) {
                    h += 17 +
                        altura(valor, 8.5, wTexto) +
                        4;
                }

                if (etapas.length) {
                    h += 19;

                    for (const etapa of etapas) {
                        h += Math.max(
                            12,
                            altura(
                                etapa.instrucao,
                                8,
                                wTexto - 57
                            )
                        ) + 5;
                    }

                } else if (item.atividade) {
                    h += 17 +
                        altura(
                            item.atividade,
                            8.5,
                            wTexto
                        ) + 4;
                }

                return {
                    item,
                    campos,
                    etapas,
                    titulo,
                    altura: h + 10
                };
            }

            function desenharCartao(cartao, y) {
                const {
                    item,
                    campos,
                    etapas,
                    titulo,
                    altura: h
                } = cartao;

                const x = baseX + 17;
                const w = baseW - 34;

                doc.roundedRect(
                    baseX,
                    y,
                    baseW,
                    h,
                    10
                ).fillAndStroke(
                    "#FFFFFF",
                    borda
                );

                doc.roundedRect(
                    baseX + 8,
                    y + 9,
                    4,
                    h - 18,
                    2
                ).fill("#245FE9");

                let cy = y + 12;

                const data = formatarData(
                    item.data_prevista
                );

                const horario =
                    `${String(item.hora_inicio || "").slice(0, 5)} - ` +
                    `${String(item.hora_fim || "").slice(0, 5)}`;

                doc.font("Helvetica-Bold")
                    .fontSize(8)
                    .fillColor("#245FE9")
                    .text(
                        data,
                        x,
                        cy,
                        { width: 90 }
                    );

                doc.fillColor("#118DA6")
                    .text(
                        horario,
                        x + 107,
                        cy,
                        { width: 130 }
                    );

                doc.fillColor(azul)
                    .text(
                        `${item.duracao_min || 0} MIN`,
                        x + w - 60,
                        cy,
                        {
                            width: 60,
                            align: "right"
                        }
                    );

                cy += 17;

                doc.font("Helvetica-Bold")
                    .fontSize(11)
                    .fillColor(azul)
                    .text(
                        titulo,
                        x,
                        cy,
                        { width: w }
                    );

                cy += altura(
                    titulo,
                    11,
                    w,
                    true
                ) + 2;

                doc.font("Helvetica-Bold")
                    .fontSize(8)
                    .fillColor("#245FE9")
                    .text(
                        item.disciplina || "Disciplina",
                        x,
                        cy,
                        { width: w }
                    );

                cy += 16;

                for (const [rotulo, valor] of campos) {
                    const alturaValor = altura(
                        valor,
                        8.5,
                        w
                    );

                    if (rotulo === "O QUE ESTUDAR") {
                        doc.roundedRect(
                            x - 7,
                            cy - 3,
                            w + 12,
                            16 + alturaValor + 3,
                            7
                        ).fill(azulClaro);
                    }

                    doc.font("Helvetica-Bold")
                        .fontSize(7.5)
                        .fillColor("#245FE9")
                        .text(
                            rotulo,
                            x,
                            cy,
                            { width: w }
                        );

                    cy += 12;

                    doc.font("Helvetica")
                        .fontSize(8.5)
                        .fillColor("#17263C")
                        .text(
                            String(valor),
                            x,
                            cy,
                            {
                                width: w,
                                lineGap: 1
                            }
                        );

                    cy += alturaValor + 9;
                }

                if (etapas.length) {
                    doc.font("Helvetica-Bold")
                        .fontSize(7.5)
                        .fillColor("#245FE9")
                        .text(
                            `ROTEIRO PRÁTICO - ${item.duracao_min || 0} MINUTOS`,
                            x,
                            cy,
                            { width: w }
                        );

                    cy += 15;

                    for (const etapa of etapas) {
                        const minutos = Number(
                            etapa.minutos || 0
                        );

                        const passo = String(
                            etapa.instrucao || ""
                        );

                        const hPasso = Math.max(
                            12,
                            altura(
                                passo,
                                8,
                                w - 57
                            )
                        );

                        doc.font("Helvetica-Bold")
                            .fontSize(8)
                            .fillColor(azul)
                            .text(
                                `${minutos} MIN`,
                                x + 2,
                                cy,
                                { width: 48 }
                            );

                        doc.font("Helvetica")
                            .fontSize(8)
                            .fillColor("#17263C")
                            .text(
                                passo,
                                x + 57,
                                cy,
                                {
                                    width: w - 57,
                                    lineGap: 1
                                }
                            );

                        cy += hPasso + 5;
                    }

                } else if (item.atividade) {
                    doc.font("Helvetica-Bold")
                        .fontSize(7.5)
                        .fillColor("#245FE9")
                        .text(
                            "ATIVIDADE PREVISTA",
                            x,
                            cy,
                            { width: w }
                        );

                    cy += 12;

                    doc.font("Helvetica")
                        .fontSize(8.5)
                        .fillColor("#17263C")
                        .text(
                            String(item.atividade),
                            x,
                            cy,
                            { width: w }
                        );
                }
            }

            let posicao = doc.y + 15;

            doc.font("Helvetica-Bold")
                .fontSize(11)
                .fillColor(azul)
                .text(
                    "Seu cronograma",
                    baseX,
                    posicao,
                    { width: baseW }
                );

            posicao += 23;

            for (const item of itens) {
                const cartao = prepararCartao(item);

                if (cartao.altura > limite - 100) {
                    throw new Error(
                        "Uma sessão está extensa demais para o cartão compacto."
                    );
                }

                if (
                    posicao + cartao.altura >
                    limite
                ) {
                    doc.addPage();
                    posicao = 62;

                    doc.font("Helvetica-Bold")
                        .fontSize(11)
                        .fillColor(azul)
                        .text(
                            "Seu cronograma - continuação",
                            baseX,
                            41,
                            { width: baseW }
                        );
                }

                desenharCartao(
                    cartao,
                    posicao
                );

                posicao += cartao.altura + 9;
            }

            const paginas =
                doc.bufferedPageRange();

            for (
                let p = paginas.start;
                p < paginas.start + paginas.count;
                p++
            ) {
                doc.switchToPage(p);

                doc.moveTo(
                    baseX,
                    doc.page.height - 69
                )
                    .lineTo(
                        baseX + baseW,
                        doc.page.height - 69
                    )
                    .strokeColor(borda)
                    .stroke();

                doc.font("Helvetica")
                    .fontSize(7)
                    .fillColor(cinza)
                    .text(
                        "Rota do Sucesso - Seu caminho, seu ritmo, sua evolução.",
                        baseX,
                        doc.page.height - 62,
                        { width: 360 }
                    );

                doc.text(
                    `Página ${p - paginas.start + 1} de ${paginas.count}`,
                    baseX + baseW - 92,
                    doc.page.height - 62,
                    {
                        width: 92,
                        align: "right"
                    }
                );
            }

            doc.end();

        }
    );

};