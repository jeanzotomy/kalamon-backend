// Cours d'initiation à l'IA pour enfants, gradués par niveau (primaire -> lycée).
// Contenu panafricain (non spécifique à un pays). Seedé dans Lesson + Quiz.
// Source de contenu unique, réutilisable par le pipeline d'ingestion plus tard.

export interface AiCourseQuestion {
  enonce: string;
  options: string[];
  bonneRep: number; // index de la bonne réponse
  explication: string;
}

export interface AiCourse {
  matiere: string;
  niveau: string;
  titre: string;
  contenu: string;
  quiz: { titre: string; questions: AiCourseQuestion[] };
}

const MATIERE = "Initiation à l'IA";

export const AI_COURSES: AiCourse[] = [
  // ---------- Primaire ----------
  {
    matiere: MATIERE,
    niveau: 'CE1',
    titre: "C'est quoi une machine intelligente ?",
    contenu:
      "Une machine intelligente, c'est un ordinateur ou un téléphone qui peut faire des choses qui ressemblent à réfléchir : reconnaître ta voix, trouver une image de chat, ou te proposer une chanson. " +
      "Mais attention : la machine ne pense pas comme toi. Elle ne ressent rien, elle ne sait pas ce qui est bien ou mal. Elle suit seulement des règles que des humains lui ont apprises. " +
      "On appelle cela l'intelligence artificielle, ou « IA ». L'IA est un outil : c'est toi qui décides, pas la machine.",
    quiz: {
      titre: 'Quiz — Les machines intelligentes',
      questions: [
        {
          enonce: 'Une machine intelligente, est-ce qu\'elle ressent des émotions comme toi ?',
          options: ['Oui, comme un ami', 'Non, elle suit seulement des règles', 'Elle dort la nuit'],
          bonneRep: 1,
          explication: "La machine ne ressent rien : elle applique des règles apprises grâce aux humains.",
        },
      ],
    },
  },
  {
    matiere: MATIERE,
    niveau: 'CM2',
    titre: "Comment l'IA reconnaît les images et les mots",
    contenu:
      "Pour reconnaître un chat sur une photo, on montre à l'IA des milliers d'images de chats. À force d'exemples, elle apprend à repérer des formes : les oreilles pointues, les moustaches, la queue. " +
      "C'est ce qu'on appelle « apprendre à partir d'exemples ». Plus elle voit d'exemples, mieux elle reconnaît — mais elle peut aussi se tromper si elle n'a jamais vu un exemple. " +
      "L'IA n'a pas compris ce qu'est vraiment un chat : elle a seulement repéré des ressemblances. C'est pour cela qu'il faut toujours vérifier ce qu'elle dit.",
    quiz: {
      titre: 'Quiz — Reconnaître images et mots',
      questions: [
        {
          enonce: "Comment l'IA apprend-elle à reconnaître un chat ?",
          options: ['En lisant un livre', 'En voyant beaucoup d\'exemples d\'images', 'Toute seule sans aide'],
          bonneRep: 1,
          explication: "L'IA apprend en observant énormément d'exemples ; sans exemples, elle ne sait pas.",
        },
        {
          enonce: 'Est-ce que l\'IA peut se tromper ?',
          options: ['Jamais', 'Oui, surtout sur des cas qu\'elle n\'a jamais vus'],
          bonneRep: 1,
          explication: 'Oui : il faut toujours vérifier ses réponses.',
        },
      ],
    },
  },
  // ---------- Collège ----------
  {
    matiere: MATIERE,
    niveau: '6e',
    titre: 'Comment une intelligence artificielle apprend',
    contenu:
      "Une IA apprend grâce à des données (des exemples) et à un entraînement. On lui donne beaucoup d'exemples avec la bonne réponse, et elle ajuste petit à petit ses « réglages » pour faire le moins d'erreurs possible. " +
      "C'est un peu comme s'entraîner à un exercice de maths : plus on pratique avec des corrigés, plus on progresse. " +
      "Trois mots-clés : les DONNÉES (les exemples), le MODÈLE (le programme qui apprend), et l'ENTRAÎNEMENT (la pratique répétée). Si les données sont fausses ou incomplètes, l'IA apprend mal.",
    quiz: {
      titre: "Quiz — Comment l'IA apprend",
      questions: [
        {
          enonce: 'De quoi une IA a-t-elle besoin pour apprendre ?',
          options: ['De données (des exemples)', 'De sommeil', 'De vacances'],
          bonneRep: 0,
          explication: "L'IA apprend à partir de données : des exemples avec les bonnes réponses.",
        },
        {
          enonce: 'Que se passe-t-il si les données sont fausses ?',
          options: ["L'IA apprend mal et se trompe", "L'IA devient plus rapide"],
          bonneRep: 0,
          explication: 'Des données de mauvaise qualité donnent une IA peu fiable.',
        },
      ],
    },
  },
  {
    matiere: MATIERE,
    niveau: '4e',
    titre: "L'IA dans la vie de tous les jours, et l'esprit critique",
    contenu:
      "Tu croises l'IA tous les jours : suggestions de vidéos, traduction automatique, correcteur d'orthographe, assistants vocaux, filtres photo. Ces outils sont utiles mais imparfaits. " +
      "Une IA peut donner une réponse fausse avec assurance : on appelle cela une « hallucination ». Elle peut aussi refléter des préjugés présents dans ses données. " +
      "La bonne attitude : utiliser l'IA comme une aide, vérifier ses sources, et garder son esprit critique. Tu restes la personne qui décide et qui réfléchit.",
    quiz: {
      titre: "Quiz — L'IA au quotidien",
      questions: [
        {
          enonce: "Quand une IA invente une réponse fausse mais convaincante, on appelle cela :",
          options: ['Une hallucination', 'Une sauvegarde', 'Un téléchargement'],
          bonneRep: 0,
          explication: "Une « hallucination » : c'est pourquoi il faut vérifier ce que dit l'IA.",
        },
        {
          enonce: 'Quelle est la bonne attitude face à l\'IA ?',
          options: ['Tout croire', 'L\'utiliser comme aide et vérifier', 'Ne jamais l\'utiliser'],
          bonneRep: 1,
          explication: "L'IA est un outil d'aide ; on garde son esprit critique.",
        },
      ],
    },
  },
  // ---------- Lycée ----------
  {
    matiere: MATIERE,
    niveau: '2nde',
    titre: 'Données, algorithmes et biais',
    contenu:
      "Un algorithme est une suite d'étapes pour résoudre un problème. En IA, l'algorithme apprend des régularités dans des données pour faire des prédictions. " +
      "Mais les données viennent du monde réel, avec ses inégalités : si elles sont déséquilibrées, l'IA reproduit et amplifie ces biais (par exemple, mieux reconnaître certains visages que d'autres). " +
      "Comprendre l'IA, c'est comprendre que la qualité et la représentativité des données déterminent la qualité des résultats. « Garbage in, garbage out » : des données biaisées donnent des décisions biaisées.",
    quiz: {
      titre: 'Quiz — Données et biais',
      questions: [
        {
          enonce: "Pourquoi une IA peut-elle être biaisée ?",
          options: [
            'Parce que ses données reflètent des inégalités du monde réel',
            'Parce qu\'elle est méchante',
            'Parce qu\'elle manque de mémoire',
          ],
          bonneRep: 0,
          explication: 'Les biais des données se retrouvent dans les décisions de l\'IA.',
        },
        {
          enonce: 'Que signifie « garbage in, garbage out » ?',
          options: [
            'De mauvaises données donnent de mauvais résultats',
            'L\'IA recycle les déchets',
          ],
          bonneRep: 0,
          explication: 'La qualité des résultats dépend de la qualité des données.',
        },
      ],
    },
  },
  {
    matiere: MATIERE,
    niveau: 'Terminale',
    titre: "IA générative : opportunités, limites et éthique",
    contenu:
      "L'IA générative (comme les assistants qui écrivent du texte ou créent des images) produit des contenus nouveaux à partir de ce qu'elle a appris. C'est un outil puissant pour apprendre, créer et travailler. " +
      "Mais elle a des limites : elle peut se tromper, inventer des faits, ou produire des contenus biaisés ; et elle pose des questions de droits d'auteur, de vie privée et de désinformation. " +
      "Bien l'utiliser, c'est : vérifier les informations, citer ses sources, protéger ses données personnelles, et ne pas tricher. En Afrique, l'IA est une chance pour l'éducation, la santé et l'entrepreneuriat — à condition de l'utiliser de façon responsable et souveraine.",
    quiz: {
      titre: 'Quiz — IA générative et éthique',
      questions: [
        {
          enonce: "Quelle est une limite importante de l'IA générative ?",
          options: [
            'Elle peut inventer des faits faux (hallucinations)',
            'Elle ne consomme pas d\'électricité',
            'Elle a toujours raison',
          ],
          bonneRep: 0,
          explication: "L'IA générative peut produire des informations fausses : il faut vérifier.",
        },
        {
          enonce: 'Quelle pratique est responsable avec l\'IA générative ?',
          options: [
            'Vérifier, citer ses sources et protéger ses données',
            'Copier-coller sans vérifier',
            'Partager ses mots de passe',
          ],
          bonneRep: 0,
          explication: 'Vérification, citation et protection des données = usage responsable.',
        },
      ],
    },
  },

  // ===== Compléments : couverture de TOUS les niveaux primaire + secondaire =====

  // ---------- Primaire ----------
  {
    matiere: MATIERE,
    niveau: 'CP',
    titre: 'Les machines qui suivent des ordres',
    contenu:
      "Un ordinateur ou un robot ne fait rien tout seul : il suit des ordres, comme quand tu suis une recette pour préparer un plat. " +
      "Si tu lui dis « avance, tourne, avance », il le fait exactement, très vite, sans se fatiguer. Mais il ne comprend pas : il exécute. " +
      "Quand une machine a l'air « intelligente », c'est parce que des humains lui ont appris beaucoup de choses. C'est toi qui donnes les ordres.",
    quiz: {
      titre: 'Quiz — Les machines suivent des ordres',
      questions: [
        {
          enonce: 'Un ordinateur fait-il les choses tout seul, sans qu\'on lui dise ?',
          options: ['Non, il suit des ordres', 'Oui, il décide tout seul'],
          bonneRep: 0,
          explication: "La machine exécute les ordres qu'on lui donne ; c'est toi qui décides.",
        },
      ],
    },
  },
  {
    matiere: MATIERE,
    niveau: 'CE2',
    titre: 'Donner des instructions : les algorithmes',
    contenu:
      "Un algorithme, c'est une suite d'étapes dans le bon ordre pour réussir quelque chose — comme une recette, ou le chemin pour aller à l'école. " +
      "Les machines suivent des algorithmes. Si une étape est dans le mauvais ordre, le résultat est faux. " +
      "L'IA utilise des algorithmes qui peuvent s'améliorer grâce à des exemples. Bien ranger les étapes, c'est déjà penser comme un informaticien.",
    quiz: {
      titre: 'Quiz — Les algorithmes',
      questions: [
        {
          enonce: "Qu'est-ce qu'un algorithme ?",
          options: ['Une suite d\'étapes dans le bon ordre', 'Un jouet électronique', 'Un dessin'],
          bonneRep: 0,
          explication: "Un algorithme est une suite d'étapes ordonnées pour atteindre un but.",
        },
        {
          enonce: "L'ordre des étapes est-il important ?",
          options: ['Oui, sinon le résultat est faux', 'Non, on peut mélanger'],
          bonneRep: 0,
          explication: 'Un mauvais ordre donne un mauvais résultat.',
        },
      ],
    },
  },
  {
    matiere: MATIERE,
    niveau: 'CM1',
    titre: "L'IA qui voit, écoute et parle",
    contenu:
      "Certaines IA reconnaissent ce qu'il y a sur une photo, comprennent ta voix, ou lisent un texte à voix haute. Comment ? On leur a montré énormément d'exemples (images, sons, phrases) et elles repèrent des ressemblances. " +
      "Ces IA sont utiles : traduire une langue, décrire une image à une personne aveugle, reconnaître une plante ou une maladie. " +
      "Mais elles peuvent confondre des choses qui se ressemblent : il faut toujours vérifier.",
    quiz: {
      titre: 'Quiz — Voir, écouter, parler',
      questions: [
        {
          enonce: 'Comment une IA apprend-elle à reconnaître une voix ?',
          options: ['En écoutant beaucoup d\'exemples', 'En dormant', 'En lisant un seul livre'],
          bonneRep: 0,
          explication: "Par l'exposition à de très nombreux exemples sonores.",
        },
      ],
    },
  },
  // ---------- Collège ----------
  {
    matiere: MATIERE,
    niveau: '5e',
    titre: 'Les données : le carburant de l\'IA',
    contenu:
      "Les données sont les informations que l'IA utilise pour apprendre : photos, textes, sons, chiffres. Sans données, pas d'IA. " +
      "Mais ces données concernent souvent des personnes : il faut respecter la vie privée et ne pas partager n'importe quoi en ligne. " +
      "Des données variées et de bonne qualité donnent une IA plus juste. Protéger ses données personnelles (nom, photos, localisation) est essentiel.",
    quiz: {
      titre: 'Quiz — Les données',
      questions: [
        {
          enonce: 'Que sont les « données » pour une IA ?',
          options: ['Les exemples qui lui servent à apprendre', 'Des décorations à l\'écran'],
          bonneRep: 0,
          explication: "Les données sont la matière première de l'apprentissage de l'IA.",
        },
        {
          enonce: 'Faut-il protéger ses données personnelles en ligne ?',
          options: ['Oui, toujours', 'Non, ce n\'est pas grave'],
          bonneRep: 0,
          explication: 'Protéger sa vie privée est essentiel.',
        },
      ],
    },
  },
  {
    matiere: MATIERE,
    niveau: '3e',
    titre: "Forces, limites et métiers de l'IA",
    contenu:
      "L'IA est très forte pour traiter beaucoup d'informations rapidement, repérer des tendances et automatiser des tâches répétitives. " +
      "Mais elle a des limites : elle ne comprend pas le sens, elle peut se tromper, et elle dépend entièrement de ses données. " +
      "L'IA crée de nouveaux métiers (données, développement, éthique) et transforme l'agriculture, la santé et la finance en Afrique. Comprendre l'IA aujourd'hui, c'est se préparer à ces opportunités.",
    quiz: {
      titre: "Quiz — Forces et limites",
      questions: [
        {
          enonce: 'Quelle est une force de l\'IA ?',
          options: ['Traiter vite beaucoup d\'informations', 'Ressentir des émotions', 'Avoir des intuitions humaines'],
          bonneRep: 0,
          explication: "L'IA excelle au traitement rapide de grandes quantités d'informations.",
        },
        {
          enonce: "L'IA comprend-elle le sens comme un humain ?",
          options: ['Non', 'Oui, exactement pareil'],
          bonneRep: 0,
          explication: "Elle repère des régularités mais ne « comprend » pas le sens.",
        },
      ],
    },
  },
  // ---------- Lycée ----------
  {
    matiere: MATIERE,
    niveau: '1re',
    titre: 'Comment les machines apprennent (apprentissage automatique)',
    contenu:
      "L'apprentissage automatique (machine learning) permet à un programme d'apprendre à partir d'exemples plutôt que d'être programmé règle par règle. " +
      "On distingue notamment : l'apprentissage SUPERVISÉ (des exemples avec la bonne réponse), NON SUPERVISÉ (trouver des regroupements sans réponse fournie), et par RENFORCEMENT (apprendre par essais et récompenses). " +
      "Ces approches font fonctionner les recommandations, la reconnaissance vocale ou les véhicules autonomes. Le point commun : la qualité des données et la mesure des erreurs déterminent le résultat.",
    quiz: {
      titre: 'Quiz — Apprentissage automatique',
      questions: [
        {
          enonce: "Dans l'apprentissage supervisé, les exemples ont-ils la bonne réponse ?",
          options: ['Oui', 'Non'],
          bonneRep: 0,
          explication: "Le supervisé s'entraîne sur des exemples étiquetés (avec la réponse).",
        },
        {
          enonce: 'Le machine learning apprend à partir de :',
          options: ['Données / exemples', 'Rien du tout', 'La chance'],
          bonneRep: 0,
          explication: 'Il apprend des régularités présentes dans les données.',
        },
      ],
    },
  },
];
