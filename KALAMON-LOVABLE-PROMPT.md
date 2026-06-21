# Prompt Lovable — UI Kalamon (exhaustif + checklist)

> Coller le **BLOC PRINCIPAL** dans un nouveau projet Lovable. Puis utiliser la
> **CHECKLIST** comme critères d'acceptation. Objectif : UI complète couvrant TOUTES
> les fonctionnalités du cahier des charges v2 + innovations, sans logique métier locale.
>
> Principe : UI seulement → appels HTTP vers `kalamon-backend`. Pas de Supabase.
> Les fonctions sans endpoint encore disponible utilisent des **données de démo** et un
> drapeau `// TODO API` — l'app ne doit JAMAIS planter sur une route absente.

---

## 🟦 BLOC PRINCIPAL (à coller)

```
Crée une application web React (Vite + TypeScript + Tailwind + shadcn/ui) nommée
"Kalamon", un tuteur IA éducatif pour élèves et parents en Afrique de l'Ouest
francophone (Guinée d'abord). PWA installable, mobile-first, optimisée faible bande
passante (2G/3G), pensée offline-first.

═══ ARCHITECTURE (non négociable) ═══
- UI UNIQUEMENT. Aucune logique métier ni IA locale. Toutes les données via une API
  REST externe, centralisée dans src/lib/api.ts, base = import.meta.env.VITE_API_BASE_URL
  (jamais d'URL en dur). CHAQUE requête : credentials:"include" (cookie httpOnly ;
  ne stocke JAMAIS de token en localStorage).
- TanStack Query (cache + persistance offline). react-router. PAS de Supabase.
- i18n dès le départ (FR par défaut, EN ; structure prête pour langues locales et RTL).
- Toute fonctionnalité sans endpoint disponible : données de démo + commentaire // TODO API,
  jamais de crash sur 404.

═══ IDENTITÉ VISUELLE ═══
- Chaleureux, ludique, enfant. Mascotte "Kalamon" animée (états: idle, réfléchit,
  félicite, encourage). Mode sombre. FR par défaut.
- Palette : vert #0F7B5A, ocre #D97706, crème #FFF8EE, ardoise #1F2937. Coins arrondis,
  ombres douces, grands boutons tactiles (>=44px), illustrations légères (SVG), pas
  d'images lourdes. Animations douces (micro-interactions, confettis sur réussite).

═══ CONTRAT D'API — DISPONIBLE (câbler pour de vrai) ═══
POST /auth/register {organizationId,email,password,fullName,role:"ELEVE"|"PARENT",phone?,niveau?} -> {userId}
POST /auth/login    {organizationId,email,password} -> {userId}
POST /auth/logout -> {ok}
GET  /eleve/:id/dashboard -> {eleve:{id,nom,niveau,points}, progression:[], lessonsDuJour:[{id,matiere,titre}]}
POST /kalamon/chat {eleveId,question} -> {reponse, source:"CACHE"|"PRECALCUL"|"RAG_LIVE", sourceChunkIds}
GET  /quiz?niveau=CM2 -> [{id,titre,niveau}]
GET  /quiz/:id -> {id,titre,niveau,questions:[{id,enonce,options:[],bonneRep,explication}]}
GET  /parent/dashboard -> [{eleveId,nom,niveau,points,difficultes:[matiere]}]
POST /parent/rapport-hebdo -> {envoye}
POST /payments/checkout {purpose:"premium_monthly",eleveId?,phone?} -> {orderId,redirectUrl,amount,currency:"GNF"}
GET  /payments/:orderId/status -> {orderId,status:"PENDING"|"SUCCESS"|"FAILED"}
GET  /subscriptions/status?eleveId= -> {plan:"premium",active,expiresAt}
GET  /lessons?niveau=&matiere= -> [{id,matiere,niveau,titre,resume}]
GET  /lessons/matieres?niveau= -> ["Initiation à l'IA","Mathématiques",...]  // catégories
GET  /lessons/:id -> {id,matiere,niveau,titre,contenu}
     // NB: la matière "Initiation à l'IA" propose des cours d'IA pour enfants gradués
     //   par niveau (CE1 -> Terminale). Affiche-la comme une CATÉGORIE vedette.

═══ CONTRAT D'API — FUTUR (construire l'UI tolérante, données de démo si 404) ═══
GET  /lessons?...&country= -> contenu LOCALISÉ (histoire/géo du pays) — démo si absent
POST /homework/analyze (multipart image) -> {ocrText, explication, exercicesSimilaires:[]}
GET  /gamification/:eleveId -> {points, badges:[{id,nom,obtenu}], avatar, streak, niveauXp}
GET  /gamification/leaderboard?scope= -> [{rang,nom,points}]
GET  /challenges/:eleveId -> {quotidiens:[], familiaux:[]}
GET  /notifications/:userId -> [{id,type,titre,lu,date}]
POST /parent/instruction {eleveId,texte} -> {ok}   // "Aide-le à réviser les fractions"

═══ ÉCRANS — ÉLÈVE ═══
1. Onboarding + Connexion/Inscription (org, email, mdp ; rôle, niveau si élève).
2. Tableau de bord élève (/eleve/:id/dashboard) : avatar mascotte, prénom, points,
   niveau, streak, badge premium, "Leçons du jour", "Défis en cours",
   "Messages de Kalamon", bouton flottant "Parler à Kalamon".
3. Cours & Leçons (/lessons, /lessons/matieres) : liste par CATÉGORIE (matière) et niveau,
   avec une catégorie vedette "Initiation à l'IA" (cours d'IA pour enfants, gradués par
   niveau). Leçon simplifiée, illustrations, exemples africains, MODE AUDIO (play/pause),
   bouton "Télécharger pour hors-ligne".
4. Exercices & Quiz (/quiz) : quiz par niveau, question par question, correction PAS À PAS,
   explication, niveau adaptatif (difficulté suivante selon réussite).
5. Aide aux devoirs : prendre/charger une PHOTO du devoir -> POST /homework/analyze ->
   afficher OCR + explication + exercices similaires. (démo si endpoint absent)
6. Chat Kalamon (/kalamon/chat) : bulles élève/Kalamon (mascotte), champ texte +
   bouton micro (dictée vocale), mode "Explique-moi comme si j'avais 6 ans", la source
   affichée discrètement ("D'après ta leçon : …"), états réfléchit/erreur/hors-ligne.
7. Gamification : page badges (obtenus/à débloquer), points, choix d'avatar, défis
   quotidiens, classements. Confettis + animation mascotte sur réussite.

═══ ÉCRANS — PARENT ═══
8. Tableau de bord parent (/parent/dashboard) : enfants, résultats, difficultés détectées,
   temps d'étude, recommandations de Kalamon, bouton "Passer au premium".
9. Communication Parent–Kalamon : champ d'instruction ("Aide-le à réviser les fractions",
   "Prépare un plan pour son contrôle", "Explique-moi ses difficultés") -> POST /parent/instruction.
10. Suivi & Alertes : baisse d'activité, progrès, difficultés ; bouton "Recevoir le
    rapport hebdo" -> POST /parent/rapport-hebdo. MODE VOCAL parent (écouter le rapport).
11. Premium / Paiement : offre premium (prix depuis /payments/checkout, devise GNF),
    bouton "Payer avec Orange Money / MTN" -> /payments/checkout -> REDIRIGE vers
    redirectUrl. Page /paiement/retour : lit ?orderId, sonde /payments/:orderId/status
    toutes les 3 s (max ~2 min) -> En attente/Réussi/Échoué. État d'abonnement via
    /subscriptions/status (actif jusqu'au {expiresAt}).

═══ TRANSVERSAL ═══
12. Notifications (cloche + page liste).
13. Réglages : langue (FR/EN), mode sombre, contrôle parental, gestion compte, déconnexion.
14. PWA : manifest + service worker, prompt d'installation, bannière "Mode hors-ligne",
    leçons/quiz consultables hors-ligne (cache), synchro à la reconnexion.
15. Accessibilité : mode audio global, lecture simplifiée (gros texte), navigation clavier,
    contrastes AA, cibles tactiles >=44px.

═══ QUALITÉ ═══
Composants réutilisables : Button, Card, StatCard, Badge, Avatar, MascotKalamon,
ChatBubble, LessonCard, QuizQuestion, ProgressRing, BadgeGrid, EmptyState, ErrorState,
OfflineBanner, PremiumBadge, AudioPlayer, ConfettiBurst.
États chargement (skeletons) / vide / erreur / hors-ligne sur CHAQUE écran. UI optimiste.
```

---

## 🚀 Fonctionnalités AU-DELÀ du cahier (à inclure)

- **PWA installable** + **notifications push** (UI d'abonnement aux notifs).
- **Voix** : dictée (Web Speech API) côté élève, lecture audio (TTS) des leçons et du
  rapport parent (inclusion des parents peu alphabétisés).
- **Répétition espacée** : section "À réviser aujourd'hui" (UI ; logique backend future).
- **Parcours d'apprentissage** : carte de progression par matière (déblocage par étapes).
- **Streak & objectifs** : série de jours, objectif quotidien, rappels.
- **i18n + RTL-ready** : architecture next-intl-like, switch FR/EN (flag + code), prêt
  pour langues locales et arabe (RTL).
- **Low-bandwidth** : images lazy + placeholders, taille minimale, fonctionne en 2G.
- **Skeletons + UI optimiste** partout ; transitions douces.
- **Mode parent multi-enfants** : bascule rapide entre enfants.

---

## ✅ CHECKLIST D'ACCEPTATION (vérifier après génération)

### Architecture & sécurité
- [ ] `src/lib/api.ts` centralise tous les appels ; base = `VITE_API_BASE_URL` (aucune URL en dur)
- [ ] Toutes les requêtes ont `credentials:"include"`
- [ ] Aucun token en localStorage ; aucune dépendance Supabase
- [ ] TanStack Query branché (+ persistance offline)
- [ ] Aucune route 404 ne fait planter l'app (fallback démo + `// TODO API`)

### Auth
- [ ] Inscription (élève & parent), connexion, déconnexion
- [ ] Redirection vers le tableau de bord selon le rôle

### Élève
- [ ] Tableau de bord : points, niveau, streak, leçons du jour, défis, messages Kalamon
- [ ] Cours & leçons : liste, leçon simplifiée, illustrations, exemples africains
- [ ] Mode audio des leçons (lecteur)
- [ ] Téléchargement leçon/quiz pour hors-ligne
- [ ] Quiz : par niveau, correction pas à pas, explication, niveau adaptatif
- [ ] Aide aux devoirs : photo → OCR → explication → exercices similaires
- [ ] Chat Kalamon : bulles + mascotte, micro, mode "comme à 6 ans", source affichée
- [ ] Gamification : badges, points, avatars, défis quotidiens, classements, confettis

### Parent
- [ ] Tableau de bord : enfants, difficultés, temps d'étude, recommandations
- [ ] Communication Parent–Kalamon (instructions)
- [ ] Alertes (baisse d'activité/progrès/difficultés) + rapport hebdo
- [ ] Mode vocal parent (écoute du rapport)
- [ ] Bascule multi-enfants

### Paiement & premium
- [ ] Écran offre premium (prix + devise GNF depuis l'API)
- [ ] Checkout → redirection vers `redirectUrl` (CinetPay)
- [ ] Page retour : polling du statut (3 s, max 2 min), états clairs
- [ ] État d'abonnement affiché (actif/expiré + date)
- [ ] Aide aux devoirs verrouillée si premium inactif (upsell)

### Transversal / qualité
- [ ] PWA installable (manifest + SW) + prompt d'installation
- [ ] Bannière + comportement hors-ligne (contenu en cache)
- [ ] Notifications (cloche + liste) + opt-in push
- [ ] i18n FR/EN (flag + code), structure RTL-ready
- [ ] Mode sombre, contrôle parental, réglages compte
- [ ] Accessibilité : audio global, lecture simplifiée, clavier, contrastes AA, cibles ≥44px
- [ ] États skeleton/vide/erreur/hors-ligne sur chaque écran
- [ ] Mascotte animée (idle/réfléchit/félicite)
- [ ] Mobile-first, fluide en 2G/3G (images lazy + placeholders)

---

## ⚙️ Réglages après génération
1. `VITE_API_BASE_URL` = URL du backend (Replit dev → Azure ACA prod). Jamais en dur.
2. Origine du front dans `CORS_ORIGINS` côté backend.
3. Tous les `fetch` avec `credentials:"include"`.
4. Export GitHub → repo `kalamon-app-ui`.

## 🔁 Prompts de retouche
- « Centralise tous les appels dans src/lib/api.ts ; types depuis le contrat d'API ;
  credentials:"include" partout. »
- « Mode hors-ligne : TanStack Query persistant + OfflineBanner ; leçons/quiz téléchargés
  consultables sans réseau. »
- « Paiement : après /payments/checkout, redirige vers redirectUrl ; sur /paiement/retour,
  sonde /payments/:orderId/status toutes les 3 s jusqu'à SUCCESS/FAILED. »
- « Verrouille l'aide aux devoirs derrière le premium (GET /subscriptions/status). »
- « Ajoute la dictée vocale (Web Speech API) dans le chat et la lecture TTS des leçons. »
- « Remplace toute référence Supabase par des appels à l'API externe. »

---

> ⚠️ Lovable produit une **app web (PWA)** — idéale pour maquette UX + premier déploiement.
> Pour le vrai **mobile offline-first** (élèves ruraux), prévoir une app **Expo/React Native**
> à partir du même contrat d'API ; le design Lovable sert alors de référence.
```
