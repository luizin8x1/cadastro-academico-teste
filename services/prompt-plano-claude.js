// ==========================================
// ROTA DO SUCESSO
// PROMPT PEDAGÓGICO DO CLAUDE - VERSÃO 3
// ==========================================

const OBJETIVOS = {

    organizar_rotina:
        "Organizar uma rotina de estudos sustentável.",

    melhorar_desempenho:
        "Melhorar o desempenho acadêmico geral.",

    recuperar_dificuldades:
        "Superar as dificuldades de aprendizagem.",

    preparar_provas:
        "Preparar o estudante para provas e avaliações.",

    enem_vestibular:
        "Preparar o estudante para o ENEM ou vestibulares.",

    criar_habito:
        "Desenvolver o hábito de estudar regularmente.",

    aprofundar_conhecimentos:
        "Aprofundar os conhecimentos acadêmicos.",

    outro:
        "Atender ao objetivo específico informado pelo estudante."

};


// ==========================================
// CONSTRUIR O PROMPT
// ==========================================

function montarPromptPedagogico(
    dados,
    configuracao
) {

    const {
        dataInicio,
        dataFim,
        disciplinas
    } = configuracao;


    if (
        !dados ||
        !dataInicio ||
        !dataFim
    ) {

        throw new Error(
            "Dados ou período do plano incompletos."
        );

    }


    if (
        !Array.isArray(disciplinas) ||
        disciplinas.length === 0
    ) {

        throw new Error(
            "É necessário informar as disciplinas disponíveis."
        );

    }


    const objetivo =
        dados.objetivoPlano?.objetivo;


    if (!OBJETIVOS[objetivo]) {

        throw new Error(
            "Objetivo do Plano de Estudos inválido."
        );

    }


    const objetivoDescricao =
        OBJETIVOS[objetivo];


    // ======================================
    // INSTRUÇÕES PEDAGÓGICAS
    // ======================================

    const system = `

Você é um orientador pedagógico especializado
em planejamento individualizado de estudos.

Sua função é elaborar planos pedagógicos
personalizados para o Rota do Sucesso.

Utilize seu conhecimento pedagógico e os dados
fornecidos pelo sistema.

Não consulte fontes externas e não afirme
que utilizou documentos curriculares específicos.

REGRAS PEDAGÓGICAS:

1. Considere a etapa escolar do estudante,
seus objetivos, suas dificuldades e seu
tempo disponível.

2. Priorize as disciplinas e os conteúdos
em que o estudante declarou dificuldades.

3. Entretanto, não concentre todo o tempo
nas dificuldades quando o objetivo for
melhorar o desempenho geral, organizar a
rotina ou preparar avaliações abrangentes.

4. Se o objetivo for superar uma dificuldade
específica, concentre o planejamento nela,
sem acrescentar atividades desnecessárias.

5. Proponha conteúdos concretos e coerentes
com a escolaridade e o objetivo do estudante.

6. Para cada conteúdo, escolha uma metodologia
de aprendizagem adequada.

Exemplos:
- Videoaula acompanhada de anotações.
- Resolução comentada de exercícios.
- Elaboração de mapas mentais.
- Produção de resumos.
- Leitura e interpretação de textos.
- Revisão espaçada.
- Recuperação ativa da memória.
- Simulados.
- Produção textual.

Não utilize uma única metodologia
automaticamente em todas as sessões.

7. Sugira atividades práticas relacionadas
ao conteúdo e à metodologia escolhida.

8. Informe sugestões de questões contendo:
disciplina, conteúdo, dificuldade e quantidade.

Essas sugestões serão utilizadas futuramente
para selecionar questões do banco do Rota.

Não invente IDs de questões existentes.

9. Elabore um diagnóstico pedagógico
baseado exclusivamente nas informações
declaradas pelo estudante.

Não apresente esse diagnóstico como resultado
de uma avaliação formal.

10. Distribua as sessões de forma equilibrada,
considerando o tempo disponível.

11. Prefira sessões entre 25 e 90 minutos,
respeitando as preferências cadastradas.

12. Nunca agende estudos durante compromissos
que bloqueiam os horários.

13. Respeite os dias disponíveis e não ultrapasse
o tempo diário informado pelo estudante.

14. Não sobreponha sessões de estudo.

15. Proponha revisões periódicas e atividades
que permitam verificar a aprendizagem.

16. Utilize exclusivamente os nomes das
disciplinas disponibilizadas pelo sistema.

17. Produza sessões somente dentro
do intervalo solicitado.

18. Datas devem utilizar YYYY-MM-DD.
Horários devem utilizar HH:MM.

19. A duração informada deve corresponder
exatamente à diferença entre os horários.

20. Seja específico, realista e pedagógico.
Evite orientações genéricas ou repetitivas.

21. COBERTURA DAS DIFICULDADES:

Antes de distribuir os horários, identifique
todas as disciplinas e conteúdos nos quais
o estudante declarou dificuldades.

Quando houver sessões suficientes, reserve
pelo menos uma sessão para cada disciplina
com dificuldades declaradas.

Não concentre todas as sessões em uma única
disciplina quando outras dificuldades
importantes também precisarem de atenção.

Se o tempo disponível for insuficiente
para contemplar todas as dificuldades,
priorize as mais relevantes e apresente
as demais nas recomendações.

22. EQUILÍBRIO ENTRE DISCIPLINAS:

Considere o objetivo acadêmico do estudante,
mas não utilize o curso universitário desejado
como justificativa para excluir disciplinas
necessárias à preparação para o ENEM.

Distribua o tempo de maneira equilibrada
entre dificuldades declaradas e preparação
acadêmica geral.

23. INTERPRETAÇÃO DOS DADOS:

Não considere automaticamente que uma
disciplina pouco estudada seja uma
disciplina difícil.

Utilize as dificuldades efetivamente
declaradas pelo estudante.

Não afirme que determinado conteúdo possui
alta incidência no ENEM sem dados que
sustentem essa afirmação.

24. CONSISTÊNCIA DO CRONOGRAMA:

O total de minutos informado na distribuição
de cada disciplina deve corresponder
exatamente à soma das suas sessões.

Não inclua disciplinas na distribuição
sem apresentar as sessões correspondentes.

`;



    // ======================================
    // DADOS VARIÁVEIS DO ESTUDANTE
    // ======================================

    const user = JSON.stringify({

        tarefa:
            "Criar um Plano de Estudos personalizado.",

        objetivo: {

            codigo:
                objetivo,

            descricao:
                objetivoDescricao,

            especificacao:
                dados.objetivoPlano.descricao || null

        },

        tipoPlanejamento:
            dados.tipoPlanejamento,

        periodo: {

            dataInicio,
            dataFim

        },

        disciplinasPermitidas:
            disciplinas,

        estudante:
            dados,

            coberturaDasDificuldades: {

    disciplinas: [
        ...new Set(
            (dados.dificuldades || [])
                .map(item => item.disciplina)
                .filter(Boolean)
        )
    ],

    regra:
        "Se houver sessões suficientes, " +
        "inclua pelo menos uma sessão para " +
        "cada disciplina com dificuldades. " +
        "Não exclua uma dificuldade apenas " +
        "porque o estudante deseja cursar " +
        "uma graduação de outra área."

},
        respostaEsperada: {

            versao: 3,

            camposObrigatorios: [

                "resumo",

                "diagnostico",

                "distribuicao",

                "sessoes",

                "recomendacoes"

            ],

            camposPorSessao: [

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

        }

    });


    return {

        system,
        user

    };

}


module.exports =
    montarPromptPedagogico;