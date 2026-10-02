"use strict";

// Controla a geração V4 pela API do servidor.
window.executarGeracaoV4 = async function executarGeracaoV4(app) {

    const usuarioId = Number(app.usuarioId);

    if (!Number.isSafeInteger(usuarioId) || usuarioId <= 0) {
        throw new Error("Usuário não identificado.");
    }

    // 1. Verificação gratuita
    app.planoEstudo.etapaGeracao =
        "Conferindo os dados do seu plano...";

    const respostaPreview = await fetch(
        `/api/plano-estudo/v4/preview/${usuarioId}`,
        { credentials: "same-origin" }
    );

    const preview = await respostaPreview.json();

    if (!respostaPreview.ok || !preview.sucesso) {
        throw new Error(
            preview.erro || "Não foi possível validar a geração."
        );
    }

    if (preview.estado === "iniciado") {
        throw new Error(
            "Existe uma geração anterior com resultado incerto. " +
            "Não tente novamente antes de verificar essa solicitação."
        );
    }

    if (
        !preview.geracaoHabilitada &&
        preview.estado === "nao_iniciada"
    ) {
        throw new Error(
            "Seus dados foram validados com sucesso. " +
            "A geração paga ainda está desativada no servidor."
        );
    }

    // 2. Geração ou recuperação de resposta existente
    app.planoEstudo.etapaGeracao =
        preview.estado === "respondido"
            ? "Recuperando o plano já gerado..."
            : preview.estado === "salvo"
                ? "Recuperando seu plano salvo..."
                : "A IA está organizando seus estudos...";

    const respostaIA = await fetch(
        `/api/plano-estudo/v4/gerar/${usuarioId}`,
        {
            method: "POST",
            credentials: "same-origin",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                confirmar: "GERAR_PLANO_V4"
            })
        }
    );

    const ia = await respostaIA.json();

    if (!respostaIA.ok || !ia.sucesso || !ia.planoId) {
        throw new Error(
            ia.erro || "A geração não foi concluída."
        );
    }

    // 3. O plano já está salvo. Agora verificamos o PDF.
    app.planoEstudo.etapaGeracao =
        "Plano salvo! Preparando o PDF...";

    let avisoPdf = "";

    try {
        await app.carregarHistoricoPlanos();

        const existente = app.planoEstudo.historico.find(
            plano => Number(plano.id) === Number(ia.planoId)
        );

        if (!existente?.pdfDisponivel) {

            const respostaPdf = await fetch(
                `/api/plano-estudo/${usuarioId}/${ia.planoId}/pdf/gerar`,
                {
                    method: "POST",
                    credentials: "same-origin"
                }
            );

            const pdf = await respostaPdf.json();

            if (!respostaPdf.ok || !pdf.sucesso) {
                throw new Error(
                    pdf.erro || "Falha ao gerar o PDF."
                );
            }
        }

    } catch (erroPdf) {

        console.error("Plano salvo; erro no PDF:", erroPdf);

        avisoPdf =
            " Seu plano foi salvo, mas o PDF ainda não está pronto. " +
            "Não solicite outra geração da IA.";
    }

    return {
        planoId: Number(ia.planoId),
        avisoPdf
    };
};