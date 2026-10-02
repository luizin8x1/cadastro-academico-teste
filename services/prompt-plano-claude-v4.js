const montarPromptV3 = require(
    "./prompt-plano-claude"
);

module.exports = function montarPromptV4(
    dados,
    configuracao
) {
    const anterior = montarPromptV3(
        dados,
        configuracao
    );

    const entrada = JSON.parse(anterior.user);

    entrada.tarefa =
        "Elaborar um planejamento pedagogico personalizado " +
        "e recomendar a pratica de exercicios. " +
        "Nao produzir questoes completas.";

    entrada.respostaEsperada = {
        versao: 4,
        camposExtrasPorSessao: [
            "objetivoAprendizagem",
            "roteiro",
            "recursos",
            "criterioSucesso"
        ],
        exercicios:
            "Somente sugestaoQuestoes: disciplina, " +
            "conteudo, dificuldade e quantidade."
    };

    const regras = `
REGRAS ADICIONAIS DA VERSAO 4:

1. Preserve todas as regras de planejamento,
horarios, prioridades e cobertura curricular
da versao anterior.

2. Para cada sessao, forneca um objetivo
de aprendizagem verificavel.

3. Apresente um roteiro metodologico
com duas a quatro etapas.

4. A soma dos minutos do roteiro deve
corresponder a duracao da sessao.

5. Informe materiais, recursos e um
criterio para verificar a aprendizagem.

6. Preencha sugestaoQuestoes indicando
disciplina, conteudo especifico,
dificuldade e quantidade de 1 a 10.

7. A disciplina de sugestaoQuestoes deve
ser identica a disciplina da sessao.

8. O conteudo recomendado para as questoes
deve corresponder ao conteudo estudado.

9. NAO produza enunciados, alternativas,
respostas, gabaritos ou resolucoes.

10. A selecao das questoes sera feita pelo
sistema a partir de seu proprio banco.

11. Apresente metas semanais e orientacoes
para acompanhamento dos estudos.

12. Nao invente resultados de avaliacoes,
notas, fontes ou links.

13. Retorne exclusivamente o JSON
compativel com o esquema V4.
`;

    return {
        system: anterior.system + "\n" + regras,
        user: JSON.stringify(entrada)
    };
};