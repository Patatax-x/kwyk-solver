<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Kwyk Tutor - Assistant IA pour kwyk.fr</title>
  <meta name="description" content="Extension Chrome et Firefox gratuite pour kwyk.fr. Explications étape par étape, indices et fiche de révision générés par IA. Sans compte, sans clé API.">
  <meta name="keywords" content="kwyk, kwyk.fr, extension kwyk, aide kwyk, kwyk tutor, mathematiques lycee, extension chrome kwyk, extension firefox kwyk, IA maths">
  <meta property="og:title" content="Kwyk Tutor - Assistant IA pour kwyk.fr">
  <meta property="og:description" content="Extension gratuite Chrome et Firefox. Comprends tes exercices kwyk.fr grâce à l'IA.">
  <meta property="og:image" content="https://raw.githubusercontent.com/Patatax-x/kwyk-solver/main/screenshots/02-explication-etape-par-etape.png">
  <meta property="og:url" content="https://patatax-x.github.io/kwyk-solver/">
  <meta name="twitter:card" content="summary_large_image">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', sans-serif; background: #0a0a0f; color: #f0f0f0; }
    a { color: #a78bfa; text-decoration: none; }

    /* NAV */
    nav {
      position: sticky; top: 0; z-index: 100;
      background: #0a0a0fcc; backdrop-filter: blur(12px);
      border-bottom: 1px solid #ffffff11;
      padding: 14px 32px; display: flex; align-items: center;
      justify-content: space-between;
    }
    nav .logo { font-weight: 800; font-size: 18px; }
    nav .logo span { color: #a78bfa; }
    nav .nav-links { display: flex; gap: 20px; font-size: 14px; }
    nav .nav-links a { color: #aaa; }
    nav .nav-links a:hover { color: white; }
    nav .btn-nav {
      background: linear-gradient(135deg, #667eea, #764ba2);
      color: white; padding: 8px 18px; border-radius: 8px;
      font-size: 14px; font-weight: 600;
    }

    /* HERO */
    .hero {
      background: linear-gradient(160deg, #1a1a3e 0%, #0a0a0f 60%);
      text-align: center; padding: 100px 20px 80px;
      position: relative; overflow: hidden;
    }
    .hero::before {
      content: '';
      position: absolute; top: -200px; left: 50%; transform: translateX(-50%);
      width: 600px; height: 600px;
      background: radial-gradient(circle, #667eea33 0%, transparent 70%);
      pointer-events: none;
    }
    .hero .badge {
      display: inline-block; background: #667eea22; border: 1px solid #667eea55;
      color: #a78bfa; font-size: 13px; padding: 6px 14px;
      border-radius: 20px; margin-bottom: 24px;
    }
    .hero h1 { font-size: 52px; font-weight: 900; line-height: 1.1; margin-bottom: 20px; }
    .hero h1 span { background: linear-gradient(135deg, #667eea, #a78bfa); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .hero p { font-size: 19px; color: #bbb; max-width: 560px; margin: 0 auto 40px; line-height: 1.6; }
    .hero-btns { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; margin-bottom: 16px; }
    .btn {
      padding: 15px 30px; border-radius: 10px; font-size: 16px;
      font-weight: 700; display: inline-flex; align-items: center; gap: 10px;
      transition: transform 0.2s, box-shadow 0.2s; cursor: pointer;
    }
    .btn:hover { transform: translateY(-2px); }
    .btn-edge { background: #0078d4; color: white; }
    .btn-edge:hover { box-shadow: 0 6px 24px #0078d466; }
    .btn-firefox { background: #ff7139; color: white; }
    .btn-firefox:hover { box-shadow: 0 6px 24px #ff713966; }
    .btn-ghost { background: #ffffff11; color: #ddd; border: 1px solid #ffffff22; }
    .hero-note { font-size: 13px; color: #666; }

    /* POURQUOI */
    .section { max-width: 960px; margin: 0 auto; padding: 80px 24px; }
    .section-label { text-align: center; color: #a78bfa; font-size: 13px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 12px; }
    .section h2 { text-align: center; font-size: 34px; font-weight: 800; margin-bottom: 16px; }
    .section .sub { text-align: center; color: #aaa; font-size: 17px; max-width: 600px; margin: 0 auto 48px; line-height: 1.6; }

    .why-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 20px; }
    .why-card {
      background: #111118; border: 1px solid #222232;
      border-radius: 16px; padding: 28px;
    }
    .why-card .icon { font-size: 32px; margin-bottom: 14px; display: block; }
    .why-card h3 { font-size: 16px; margin-bottom: 8px; }
    .why-card p { font-size: 14px; color: #888; line-height: 1.6; }

    /* COMMENT */
    .steps-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 24px; }
    .step-card { text-align: center; }
    .step-num {
      width: 48px; height: 48px; border-radius: 50%;
      background: linear-gradient(135deg, #667eea, #764ba2);
      color: white; font-size: 20px; font-weight: 800;
      display: flex; align-items: center; justify-content: center;
      margin: 0 auto 16px;
    }
    .step-card h3 { font-size: 15px; margin-bottom: 8px; }
    .step-card p { font-size: 13px; color: #888; line-height: 1.5; }

    /* MODES */
    .modes-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; }
    .mode-card {
      background: #111118; border: 1px solid #222232;
      border-radius: 14px; padding: 24px; text-align: center;
      transition: border-color 0.2s;
    }
    .mode-card:hover { border-color: #667eea55; }
    .mode-card .icon { font-size: 36px; display: block; margin-bottom: 12px; }
    .mode-card h3 { font-size: 16px; margin-bottom: 8px; }
    .mode-card p { font-size: 13px; color: #888; line-height: 1.5; }

    /* SCREENSHOTS */
    .screenshots { display: flex; flex-direction: column; gap: 48px; }
    .screenshot-item { text-align: center; }
    .screenshot-item .caption { font-size: 14px; color: #888; margin-bottom: 14px; }
    .screenshot-item img {
      max-width: 100%; border-radius: 14px;
      border: 1px solid #222232;
      box-shadow: 0 12px 48px rgba(0,0,0,0.6);
    }

    /* NOTER */
    .rate-section {
      background: #111118; border: 1px solid #222232;
      border-radius: 20px; padding: 48px 32px; text-align: center;
    }
    .rate-section h2 { font-size: 28px; margin-bottom: 12px; }
    .rate-section p { color: #aaa; font-size: 16px; margin-bottom: 32px; max-width: 480px; margin-left: auto; margin-right: auto; }
    .rate-btns { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; }
    .btn-rate-edge { background: #0078d422; border: 1px solid #0078d466; color: #5bc0f8; padding: 12px 24px; border-radius: 10px; font-size: 15px; font-weight: 600; display: inline-flex; align-items: center; gap: 8px; transition: background 0.2s; }
    .btn-rate-edge:hover { background: #0078d444; }
    .btn-rate-ff { background: #ff713922; border: 1px solid #ff713966; color: #ff9a6c; padding: 12px 24px; border-radius: 10px; font-size: 15px; font-weight: 600; display: inline-flex; align-items: center; gap: 8px; transition: background 0.2s; }
    .btn-rate-ff:hover { background: #ff713944; }

    /* PARTAGER */
    .share-section { text-align: center; padding: 60px 24px; }
    .share-section h2 { font-size: 26px; margin-bottom: 12px; }
    .share-section p { color: #aaa; font-size: 15px; margin-bottom: 28px; }
    .share-btns { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
    .share-btn {
      padding: 10px 20px; border-radius: 8px; font-size: 14px; font-weight: 600;
      display: inline-flex; align-items: center; gap: 8px; transition: opacity 0.2s;
    }
    .share-btn:hover { opacity: 0.8; }
    .share-reddit { background: #ff4500; color: white; }
    .share-twitter { background: #1da1f2; color: white; }
    .share-whatsapp { background: #25d366; color: white; }
    .copy-btn { background: #333; color: #ddd; border: 1px solid #444; cursor: pointer; font-family: inherit; }

    /* WARNING */
    .warning-box {
      background: #1a1500; border: 1px solid #f59e0b44;
      border-radius: 12px; padding: 20px 24px;
      font-size: 13px; color: #aaa; line-height: 1.7;
      max-width: 960px; margin: 0 auto 40px;
    }
    .warning-box strong { color: #f59e0b; }

    footer {
      text-align: center; padding: 32px; font-size: 12px; color: #444;
      border-top: 1px solid #111;
    }
    footer a { color: #666; }
    footer a:hover { color: #aaa; }

    /* DIVIDER */
    .divider { border: none; border-top: 1px solid #111118; max-width: 960px; margin: 0 auto; }
  </style>
</head>
<body>

  <nav>
    <div class="logo">🎓 Kwyk <span>Tutor</span></div>
    <div class="nav-links">
      <a href="#comment">Comment</a>
      <a href="#modes">Modes</a>
      <a href="#apercu">Aperçu</a>
      <a href="#noter">Noter</a>
    </div>
    <a class="btn-nav" href="https://microsoftedge.microsoft.com/addons/detail/kwyk-tutor/cpfjdpkkflmobgfeadjhjlecfehlkblg" target="_blank">Installer</a>
  </nav>

  <div class="hero">
    <div class="badge">✨ Gratuit, sans compte, sans clé API</div>
    <h1>L'assistant IA pour<br><span>kwyk.fr</span></h1>
    <p>Comprends tes exercices de maths, pas juste les réponses. Explication étape par étape, indices personnalisés, fiche de révision complète.</p>
    <div class="hero-btns">
      <a class="btn btn-edge" href="https://microsoftedge.microsoft.com/addons/detail/kwyk-tutor/cpfjdpkkflmobgfeadjhjlecfehlkblg" target="_blank">⬇️ Installer sur Edge</a>
      <a class="btn btn-firefox" href="LIEN_AMO" target="_blank">⬇️ Installer sur Firefox</a>
      <a class="btn btn-ghost" href="https://github.com/Patatax-x/kwyk-solver" target="_blank">⭐ GitHub</a>
    </div>
    <p class="hero-note">Compatible Microsoft Edge et Firefox. 100% gratuit.</p>
  </div>

  <div class="section">
    <div class="section-label">Pourquoi Kwyk Tutor ?</div>
    <h2>Fait pour vraiment progresser</h2>
    <p class="sub">Kwyk.fr donne des exercices mais pas d'explications. Kwyk Tutor comble ce manque en ajoutant une aide pédagogique directement sur la page.</p>
    <div class="why-grid">
      <div class="why-card">
        <span class="icon">🧠</span>
        <h3>Comprendre, pas copier</h3>
        <p>L'IA explique la règle, détaille les étapes et aide à comprendre pourquoi la réponse est correcte.</p>
      </div>
      <div class="why-card">
        <span class="icon">⚡</span>
        <h3>Instantané</h3>
        <p>Aide disponible en quelques secondes directement sur la page kwyk.fr. Aucune installation complexe.</p>
      </div>
      <div class="why-card">
        <span class="icon">🔒</span>
        <h3>Aucune donnée personnelle</h3>
        <p>Aucun compte requis. Aucune donnée personnelle collectée. Seul l'énoncé de l'exercice est transmis à l'IA.</p>
      </div>
    </div>
  </div>

  <hr class="divider">

  <div class="section" id="comment">
    <div class="section-label">Utilisation</div>
    <h2>Comment ça marche ?</h2>
    <p class="sub">3 étapes, moins de 10 secondes.</p>
    <div class="steps-grid">
      <div class="step-card">
        <div class="step-num">1</div>
        <h3>Ouvre un exercice</h3>
        <p>Va sur kwyk.fr et lance n'importe quel exercice de mathématiques.</p>
      </div>
      <div class="step-card">
        <div class="step-num">2</div>
        <h3>Clique sur KT 🟣</h3>
        <p>Le bouton violet apparaît en bas à droite. Clique dessus pour ouvrir l'assistant.</p>
      </div>
      <div class="step-card">
        <div class="step-num">3</div>
        <h3>Choisis ton aide</h3>
        <p>Explique, Indice ou Révision. L'IA génère une aide adaptée à l'exercice en cours.</p>
      </div>
      <div class="step-card">
        <div class="step-num">⌨️</div>
        <h3>Raccourci Ctrl+Entrée</h3>
        <p>Affiche ou masque rapidement le bouton et le panneau depuis n'importe quelle page.</p>
      </div>
    </div>
  </div>

  <hr class="divider">

  <div class="section" id="modes">
    <div class="section-label">Modes</div>
    <h2>3 niveaux d'aide</h2>
    <p class="sub">Du coup de pouce discret à la fiche de révision complète.</p>
    <div class="modes-grid">
      <div class="mode-card">
        <span class="icon">📖</span>
        <h3>Pédagogique</h3>
        <p>Règle + explication complète étape par étape. Pour vraiment comprendre la méthode.</p>
      </div>
      <div class="mode-card">
        <span class="icon">💡</span>
        <h3>Indice</h3>
        <p>Un coup de pouce sans donner la réponse. Pour débloquer par soi-même.</p>
      </div>
      <div class="mode-card">
        <span class="icon">📝</span>
        <h3>Révision</h3>
        <p>Fiche interactive générée sur tout un devoir. Notions clés, erreurs, points à retravailler.</p>
      </div>
      <div class="mode-card">
        <span class="icon">😈</span>
        <h3>Troll</h3>
        <p>Démontre les capacités de l'IA. <strong>Non conseillé pour apprendre.</strong></p>
      </div>
    </div>
  </div>

  <hr class="divider">

  <div class="section" id="apercu">
    <div class="section-label">Aperçu</div>
    <h2>L'extension en action</h2>
    <p class="sub"></p>
    <div class="screenshots">
      <div class="screenshot-item">
        <p class="caption">Réponse directe avec la règle</p>
        <img src="https://raw.githubusercontent.com/Patatax-x/kwyk-solver/main/screenshots/01-reponse-directe.png" alt="Kwyk Tutor réponse directe sur kwyk.fr">
      </div>
      <div class="screenshot-item">
        <p class="caption">Explication étape par étape</p>
        <img src="https://raw.githubusercontent.com/Patatax-x/kwyk-solver/main/screenshots/02-explication-etape-par-etape.png" alt="Kwyk Tutor explication mathématiques lycée">
      </div>
      <div class="screenshot-item">
        <p class="caption">Sélection du mode d'aide</p>
        <img src="https://raw.githubusercontent.com/Patatax-x/kwyk-solver/main/screenshots/03-popup-modes.png" alt="Kwyk Tutor popup sélection mode pédagogique">
      </div>
      <div class="screenshot-item">
        <p class="caption">Fiche de révision interactive</p>
        <img src="https://raw.githubusercontent.com/Patatax-x/kwyk-solver/main/screenshots/5%20-%20Fiche%20r%C3%A9cap.png" alt="Kwyk Tutor fiche de révision kwyk.fr">
      </div>
    </div>
  </div>

  <hr class="divider">

  <div class="section" id="noter">
    <div class="rate-section">
      <h2>⭐ Notez l'extension</h2>
      <p>Un avis positif aide d'autres élèves à trouver Kwyk Tutor et fait progresser le projet. Cela prend 30 secondes.</p>
      <div class="rate-btns">
        <a class="btn-rate-edge" href="https://microsoftedge.microsoft.com/addons/detail/kwyk-tutor/cpfjdpkkflmobgfeadjhjlecfehlkblg" target="_blank">⭐ Noter sur Edge Add-ons</a>
        <a class="btn-rate-ff" href="LIEN_AMO_REVIEWS" target="_blank">⭐ Noter sur Firefox AMO</a>
      </div>
    </div>
  </div>

  <div class="share-section">
    <h2>📢 Partager</h2>
    <p>Connais-tu un élève qui utilise kwyk.fr ? Partage-lui l'extension.</p>
    <div class="share-btns">
      <a class="share-btn share-reddit"
        href="https://www.reddit.com/submit?url=https://patatax-x.github.io/kwyk-solver/&title=Kwyk%20Tutor%20%E2%80%94%20Assistant%20IA%20gratuit%20pour%20kwyk.fr"
        target="_blank">📮 Partager sur Reddit</a>
      <a class="share-btn share-twitter"
        href="https://twitter.com/intent/tweet?text=Kwyk%20Tutor%20%3A%20assistant%20IA%20gratuit%20pour%20comprendre%20les%20maths%20sur%20kwyk.fr%20%F0%9F%8E%93&url=https://patatax-x.github.io/kwyk-solver/"
        target="_blank">🐦 Partager sur X</a>
      <a class="share-btn share-whatsapp"
        href="https://wa.me/?text=Kwyk%20Tutor%20%3A%20extension%20IA%20gratuite%20pour%20comprendre%20les%20maths%20sur%20kwyk.fr%20%F0%9F%8E%93%20https://patatax-x.github.io/kwyk-solver/"
        target="_blank">💬 Partager sur WhatsApp</a>
      <button class="share-btn copy-btn" onclick="navigator.clipboard.writeText('https://patatax-x.github.io/kwyk-solver/').then(()=>{this.textContent='✅ Copié !'});setTimeout(()=>{this.textContent='🔗 Copier le lien'},2000)">🔗 Copier le lien</button>
    </div>
  </div>

  <div style="max-width:960px;margin:0 auto;padding:0 24px 40px">
    <div class="warning-box">
      <strong>Avertissement :</strong> Kwyk Tutor est un outil pédagogique indépendant, non affilié à Kwyk SAS. L'utilisateur est seul responsable du respect des règles de son établissement. Utiliser cette extension lors d'un contrôle ou devoir noté interdit par le professeur engage uniquement la responsabilité de l'utilisateur.
      &nbsp; <a href="https://patatax-formulaire.notion.site/Conditions-d-Utilisation-Kwyk-Tutor-35cc3ccd8936818f8306d0374eaaf9d6" style="color:#f59e0b">CGU</a>
      &nbsp; <a href="https://patatax-formulaire.notion.site/Politique-de-Confidentialit-Kwyk-Tutor-35cc3ccd89368192a4a0de5db53f6db5" style="color:#f59e0b">Confidentialité</a>
    </div>
  </div>

  <footer>
    Kwyk Tutor v2.1.1 &nbsp;|&nbsp; Développé par <a href="https://github.com/Patatax-x">Patatax</a> &nbsp;|&nbsp;
    <a href="https://github.com/Patatax-x/kwyk-solver">Code source</a>
  </footer>

</body>
</html>
