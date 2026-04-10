// Pokemon Repository — fetches from PokéAPI and renders a browsable picker

const POKEAPI_URL = 'https://pokeapi.co/api/v2/pokemon?limit=1025&offset=0';
const SPRITE_BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/';

let allPokemon = [];
let filteredPokemon = [];

function spriteUrl(id) {
    return `${SPRITE_BASE}${id}.png`;
}

async function initPokemonRepo() {
    const repoGrid = document.getElementById('pokeRepoGrid');
    const repoSearch = document.getElementById('pokeRepoSearch');
    const repoToggle = document.getElementById('pokeRepoToggle');
    const repoBody = document.getElementById('pokeRepoBody');

    repoToggle.addEventListener('click', () => {
        const isOpen = repoBody.style.display !== 'none';
        repoBody.style.display = isOpen ? 'none' : 'block';
        repoToggle.textContent = isOpen ? '▸ Browse Pokémon' : '▾ Browse Pokémon';
    });

    repoGrid.innerHTML = '<p class="repo-loading">Loading Pokémon...</p>';

    try {
        const res = await fetch(POKEAPI_URL);
        const data = await res.json();
        allPokemon = data.results.map((p, i) => ({
            name: p.name,
            id: i + 1,
            displayName: p.name.charAt(0).toUpperCase() + p.name.slice(1).replace(/-/g, ' ')
        }));
        filteredPokemon = allPokemon;
        renderPokeGrid(repoGrid, filteredPokemon);
    } catch (e) {
        console.error('Failed to load Pokémon list:', e);
        repoGrid.innerHTML = '<p class="repo-loading">Failed to load Pokémon. Check your connection.</p>';
        return;
    }

    repoSearch.addEventListener('input', () => {
        const q = repoSearch.value.trim().toLowerCase();
        filteredPokemon = q
            ? allPokemon.filter(p => p.name.includes(q) || String(p.id).includes(q))
            : allPokemon;
        renderPokeGrid(repoGrid, filteredPokemon);
    });
}

function renderPokeGrid(container, list) {
    container.innerHTML = '';
    if (list.length === 0) {
        container.innerHTML = '<p class="repo-loading">No Pokémon found.</p>';
        return;
    }

    const CHUNK = 100;
    let index = 0;

    function renderChunk() {
        const fragment = document.createDocumentFragment();
        const end = Math.min(index + CHUNK, list.length);
        for (let i = index; i < end; i++) {
            const p = list[i];
            const card = document.createElement('div');
            card.className = 'poke-card';
            card.title = p.displayName;

            const img = document.createElement('img');
            img.src = spriteUrl(p.id);
            img.alt = p.displayName;
            img.loading = 'lazy';
            img.onerror = () => { img.style.opacity = '0.2'; };

            const label = document.createElement('span');
            label.textContent = p.displayName;

            card.appendChild(img);
            card.appendChild(label);

            // Store pokemon data on the card element itself
            card.dataset.pokemonId = p.id;
            card.dataset.pokemonName = p.displayName;
            card.addEventListener('click', () => loadPokemonIntoTool(p.id, p.displayName, card));

            fragment.appendChild(card);
        }
        container.appendChild(fragment);
        index = end;
        if (index < list.length) requestAnimationFrame(renderChunk);
    }
    renderChunk();
}

function loadPokemonIntoTool(id, displayName, cardEl) {
    // Highlight card
    document.querySelectorAll('.poke-card').forEach(c => c.classList.remove('active'));
    cardEl.classList.add('active');

    const url = spriteUrl(id);
    console.log('Loading pokemon sprite:', url);

    const img = new Image();

    // crossOrigin must be set BEFORE src for CORS to work
    img.crossOrigin = 'anonymous';

    img.onload = function () {
        console.log('Sprite loaded, size:', img.naturalWidth, 'x', img.naturalHeight);

        // Set via the exposed setter in app.js
        setUploadedImage(img);

        document.getElementById('controls').style.display = 'block';
        document.getElementById('canvasContainer').style.display = 'block';
        document.getElementById('actions').style.display = 'block';

        // Save to recent tray
        try {
            const offscreen = document.createElement('canvas');
            offscreen.width = img.naturalWidth;
            offscreen.height = img.naturalHeight;
            offscreen.getContext('2d').drawImage(img, 0, 0);
            addToRecent(offscreen.toDataURL('image/png'), displayName);
        } catch (e) {
            console.warn('Could not save to recent (canvas taint?):', e);
        }

        updatePattern();
    };

    img.onerror = function () {
        console.error('Failed to load sprite for:', displayName, url);
        alert(`Couldn't load sprite for ${displayName}`);
    };

    img.src = url;
}
