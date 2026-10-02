// ==========================================
// ROTA DO SUCESSO
// PREPARAR DADOS PARA O CLAUDE
// ==========================================

function prepararDadosClaude(payload) {

    if (!payload) {
        throw new Error(
            "Dados do estudante não informados."
        );
    }

    const perfil = payload.perfil || {};

    const tempo = payload.tempoEstudo || {};

    const rotina = payload.rotina || {};

    const objetivo = payload.objetivoPlano || {};


    // ======================================
    // VALIDAR TIPO DE PLANEJAMENTO
    // ======================================

    const tipoPlanejamento =
        payload.tipoPlanejamento;

    if (
        !["semanal", "mensal"].includes(
            tipoPlanejamento
        )
    ) {

        throw new Error(
            "Tipo de planejamento inválido."
        );

    }


    // ======================================
    // DADOS QUE SERÃO ENVIADOS À IA
    // ======================================

    return {

        perfilAcademico: {

            serie: perfil.serie,

            etapaAtual:
                perfil.etapa_atual,

            redeEnsino:
                perfil.rede_ensino,

            cursoDesejado:
                perfil.curso_desejado || null,

            universidadeDesejada:
                perfil.universidade_desejada || null

        },


        dificuldades: (

            payload.dificuldades || []

        ).map(item => ({

            disciplina:
                item.disciplina,

            conteudos: [

                item.conteudo_1,
                item.conteudo_2,
                item.conteudo_3

            ].filter(Boolean)

        })),


        disciplinaNaoEstudada:

            perfil.disciplina_nao_estuda ||
            null,


        tempoDisponivel: {

            minutosPorDia:
                tempo.tempo_disponivel_minutos,

            diasDisponiveis:
                tempo.dias_disponiveis,

            periodoPreferido:
                tempo.periodo_preferido,

            fimSemana:
                tempo.fim_semana,

            periodoLivre:
                tempo.periodo_livre

        },


        rotinaDiaria: {

            preferenciaPeriodo:
                rotina.preferenciaPeriodo,

            duracaoBlocoMin:
                rotina.duracaoBlocoMin,

            intervaloMin:
                rotina.intervaloMin,

            rotinaVariavel:
                rotina.rotinaVariavel,

            compromissos: (

                rotina.compromissos || []

            ).map(item => ({

                diaSemana:
                    item.dia_semana,

                horaInicio:
                    item.hora_inicio,

                horaFim:
                    item.hora_fim,

                tipoAtividade:
                    item.tipo_atividade,

                deslocamentoMin:
                    item.tempo_deslocamento_min,

                bloqueiaEstudo:
                    item.bloqueia_estudo,

                fixo:
                    item.fixo

            }))

        },


        objetivoPlano: {

            objetivo:
                objetivo.objetivo,

            descricao:

                objetivo.objetivo === "outro"

                    ? objetivo.objetivo_outro || null

                    : null

        },


        tipoPlanejamento

    };

}


module.exports = prepararDadosClaude;