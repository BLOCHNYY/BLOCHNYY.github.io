/* =============================================
   BLOCHNYY — script.js
   ============================================= */

// ---- Wiki topics ----
const wikiTopics = {
    started: `<h1>Guida Introduttiva</h1>
              <p>Benvenuto nel mondo di Blochnyy! Per iniziare, dovrai raccogliere legna dai primi alberi che trovi. Usa il menu di crafting base per creare un'ascia di legno.</p>
              <p>Attento alla notte: i mostri appariranno e avrai bisogno di un rifugio.</p>`,
    blocks:  `<h1>Blocchi & Materiali</h1>
              <p>Il mondo è fatto di blocchi. I principali sono:</p>
              <ul>
                  <li><b>Terra:</b> Il blocco più comune in superficie.</li>
                  <li><b>Pietra:</b> Trovata sottoterra, essenziale per strumenti migliori.</li>
                  <li><b>Legno:</b> Ottenuto dagli alberi, base per il crafting.</li>
              </ul>`,
    tools:   `<h1>Strumenti & Crafting</h1>
              <p>Usa il banco da lavoro per creare strumenti avanzati. Un piccone ti serve per la pietra, un'ascia per il legno.</p>`,
    mobs:    `<h1>Creature & NPC</h1>
              <p>Non sei solo. Incontrerai creature passive come le pecore e ostili come i Mushroom Crawlers che trovi nei campi di funghi.</p>`,
    world:   `<h1>Meccaniche del Mondo</h1>
              <p>Il mondo è generato proceduralmente ogni volta che crei un nuovo salvataggio. Le grotte si estendono in profondità.</p>`
};

// ---- Helpers ----

/**
 * Ordina gli annunci dal più recente al meno recente (formato dd/mm/yyyy)
 */
function sortByDate(announcements) {
    return [...announcements].sort((a, b) => {
        const parse = (str) => {
            const [d, m, y] = str.split('/').map(Number);
            return new Date(y, m - 1, d);
        };
        return parse(b.date) - parse(a.date);
    });
}

/**
 * Crea la card piccola per home / 404
 */
function buildSmallCard(ann) {
    const card = document.createElement('div');
    card.className = 'ann-card';
    card.innerHTML = `
        <div class="ann-card-date">${ann.date}</div>
        <div class="ann-card-title">${ann.title}</div>
        <div class="ann-card-content">${ann.content}</div>
        <div class="ann-card-author">— ${ann.author}</div>
    `;
    return card;
}

/**
 * Crea la card grande per la pagina announcements
 */
function buildFullCard(ann) {
    const card = document.createElement('div');
    card.className = 'ann-card-full';
    card.innerHTML = `
        <div class="ann-card-full-meta">
            <div class="ann-card-full-date">${ann.date}</div>
            <div class="ann-card-full-author">${ann.author}</div>
        </div>
        <div class="ann-card-full-body">
            <div class="ann-card-full-title">${ann.title}</div>
            <div class="ann-card-full-content">${ann.content}</div>
        </div>
    `;
    return card;
}

/**
 * Carica db.json e riempie i container indicati
 * @param {string|null} previewGridId  - id del grid per gli ultimi 3 (null = skip)
 * @param {string|null} fullListId     - id della lista completa (null = skip)
 */
async function loadAnnouncements(previewGridId, fullListId) {
    let data;
    try {
        const res = await fetch('db.json');
        if (!res.ok) throw new Error('db.json non trovato');
        data = await res.json();
    } catch (e) {
        console.warn('Impossibile caricare db.json:', e);
        // Mostra messaggio di errore nei container
        [previewGridId, fullListId].forEach(id => {
            if (!id) return;
            const el = document.getElementById(id);
            if (el) el.innerHTML = `<p style="font-family:var(--font-pixel);font-size:.5rem;color:var(--text-muted);grid-column:1/-1;padding:20px 0;">Impossibile caricare gli annunci.</p>`;
        });
        return;
    }

    const sorted = sortByDate(data.announcements || []);

    // Preview: ultimi 3
    if (previewGridId) {
        const grid = document.getElementById(previewGridId);
        if (grid) {
            grid.innerHTML = '';
            sorted.slice(0, 3).forEach(ann => grid.appendChild(buildSmallCard(ann)));
        }
    }

    // Full list: tutti
    if (fullListId) {
        const list = document.getElementById(fullListId);
        if (list) {
            list.innerHTML = '';
            sorted.forEach(ann => list.appendChild(buildFullCard(ann)));
        }
    }
}

// ---- Init ----
document.addEventListener('DOMContentLoaded', () => {

    // --- Wiki navigation ---
    const wikiNavLinks = document.querySelectorAll('#wiki-nav a');
    const wikiArticle  = document.getElementById('wiki-article');
    if (wikiNavLinks.length && wikiArticle) {
        wikiNavLinks.forEach(link => {
            link.addEventListener('click', e => {
                e.preventDefault();
                wikiNavLinks.forEach(l => l.classList.remove('active'));
                link.classList.add('active');
                const topic = link.getAttribute('data-topic');
                if (wikiTopics[topic]) wikiArticle.innerHTML = wikiTopics[topic];
            });
        });
    }

    // --- Subtle parallax on game preview ---
    const gamePreview = document.querySelector('.hero-game-preview');
    if (gamePreview) {
        window.addEventListener('mousemove', e => {
            const moveX = (e.clientX - window.innerWidth  / 2) * 0.008;
            const moveY = (e.clientY - window.innerHeight / 2) * 0.008;
            gamePreview.style.transform = `translate(${moveX}px, ${moveY}px)`;
        });
    }

    // --- Announcements: HOME ---
    const homeGrid = document.getElementById('home-ann-grid');
    if (homeGrid) {
        loadAnnouncements('home-ann-grid', null);
    }

    // --- Announcements: 404 ---
    const grid404 = document.getElementById('404-ann-grid');
    if (grid404) {
        loadAnnouncements('404-ann-grid', null);
    }

    // --- Announcements: full page ---
    const fullList = document.getElementById('ann-full-list');
    if (fullList) {
        loadAnnouncements(null, 'ann-full-list');
    }
});
