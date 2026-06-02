// ===== Chinese Flashcard App =====
(function() {
  'use strict';

  // ===== State =====
  let savedCards = JSON.parse(localStorage.getItem('zhCards') || '[]');
  let customCategories = JSON.parse(localStorage.getItem('zhCustomCats') || '[]');
  let currentPage = 'search';
  let studyCategory = 'All';
  let studyIndex = 0;
  let studyDeck = [];
  let quizState = null;
  let pendingAddWord = null;
  let detailCategory = null;

  // ===== Helper: strip tones from pinyin for searching =====
  const toneMap = {
    'ā':'a','á':'a','ǎ':'a','à':'a',
    'ē':'e','é':'e','ě':'e','è':'e',
    'ī':'i','í':'i','ǐ':'i','ì':'i',
    'ō':'o','ó':'o','ǒ':'o','ò':'o',
    'ū':'u','ú':'u','ǔ':'u','ù':'u',
    'ǖ':'v','ǘ':'v','ǚ':'v','ǜ':'v'
  };

  function stripTones(str) {
    return str.split('').map(ch => toneMap[ch] || ch).join('').toLowerCase();
  }

  function isChinese(str) {
    return /[一-鿿]/.test(str);
  }

  // ===== Persistence =====
  function save() {
    localStorage.setItem('zhCards', JSON.stringify(savedCards));
    localStorage.setItem('zhCustomCats', JSON.stringify(customCategories));
    updateStats();
  }

  function isCardSaved(word) {
    return savedCards.some(c => c.s === word.s);
  }

  function addCard(word, category) {
    if (!isCardSaved(word)) {
      savedCards.push({ ...word, userCat: category || word.c });
      save();
    }
  }

  function removeCard(word) {
    savedCards = savedCards.filter(c => c.s !== word.s);
    save();
  }

  // ===== Get all user categories =====
  function getUserCategories() {
    const cats = new Set();
    savedCards.forEach(c => cats.add(c.userCat || c.c));
    customCategories.forEach(c => cats.add(c));
    return [...cats].sort();
  }

  // Category colors
  const catColors = [
    '#e74c3c','#e67e22','#f1c40f','#2ecc71','#1abc9c',
    '#3498db','#9b59b6','#e84393','#00b894','#6c5ce7',
    '#fd79a8','#0984e3','#636e72','#d63031','#a29bfe'
  ];

  function getCatColor(cat) {
    let hash = 0;
    for (let i = 0; i < cat.length; i++) hash = cat.charCodeAt(i) + ((hash << 5) - hash);
    return catColors[Math.abs(hash) % catColors.length];
  }

  // ===== Navigation =====
  function navigate(page) {
    currentPage = page;
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('page-' + page).classList.add('active');
    document.querySelector(`[data-page="${page}"]`).classList.add('active');

    if (page === 'study') renderStudyPage();
    if (page === 'mycards') renderMyCards();
    if (page === 'quiz') renderQuizSetup();
  }

  // ===== Stats =====
  function updateStats() {
    document.getElementById('header-stats').textContent =
      `${savedCards.length} saved | ${DICTIONARY.length} in dictionary`;
  }

  // ===== Toast =====
  function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('visible');
    setTimeout(() => t.classList.remove('visible'), 2000);
  }

  // ===== SEARCH PAGE =====
  function searchDictionary(query) {
    if (!query || query.length < 1) return [];
    const q = query.trim().toLowerCase();
    const qStripped = stripTones(q);
    const qIsChinese = isChinese(q);

    let results = DICTIONARY.filter(entry => {
      if (qIsChinese) {
        return entry.s.includes(q);
      }
      // Search by pinyin (with or without tones) or English
      const pinyinMatch = entry.p.toLowerCase().includes(q) ||
                          stripTones(entry.p).includes(qStripped);
      const englishMatch = entry.e.toLowerCase().includes(q);
      return pinyinMatch || englishMatch;
    });

    // Sort: exact matches first, then by relevance
    results.sort((a, b) => {
      if (qIsChinese) {
        if (a.s === q && b.s !== q) return -1;
        if (b.s === q && a.s !== q) return 1;
        return a.s.length - b.s.length;
      }
      const aExact = a.e.toLowerCase() === q || a.p.toLowerCase() === q;
      const bExact = b.e.toLowerCase() === q || b.p.toLowerCase() === q;
      if (aExact && !bExact) return -1;
      if (bExact && !aExact) return 1;
      return 0;
    });

    return results.slice(0, 50);
  }

  function renderSearchResults(results) {
    const container = document.getElementById('search-results');
    if (results.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">&#x1F50D;</div><p>No results found.<br>Try searching in English, Pinyin, or Chinese characters.</p></div>';
      return;
    }

    container.innerHTML = results.map(entry => {
      const saved = isCardSaved(entry);
      return `
        <div class="search-result-card">
          <div class="result-info">
            <div class="result-chinese">${entry.s}</div>
            <div class="result-pinyin">${entry.p}</div>
            <div class="result-english">${entry.e}</div>
            <span class="result-category">${entry.c}</span>
          </div>
          <button class="btn-add ${saved ? 'added' : ''}"
                  data-word="${encodeURIComponent(JSON.stringify(entry))}"
                  ${saved ? 'disabled' : ''}>
            ${saved ? '&#10003;' : '+'}
          </button>
        </div>
      `;
    }).join('');

    // Attach add handlers
    container.querySelectorAll('.btn-add:not(.added)').forEach(btn => {
      btn.addEventListener('click', () => {
        const word = JSON.parse(decodeURIComponent(btn.dataset.word));
        pendingAddWord = word;
        showAddModal(word);
      });
    });
  }

  // ===== ADD MODAL =====
  function showAddModal(word) {
    const overlay = document.getElementById('modal-overlay');
    const preview = document.getElementById('modal-word-preview');
    const catList = document.getElementById('modal-categories');

    preview.textContent = `${word.s} (${word.p}) - ${word.e}`;

    // Show existing categories + the word's auto-category
    const cats = getUserCategories();
    if (!cats.includes(word.c)) cats.unshift(word.c);

    let selectedCat = word.c;

    catList.innerHTML = cats.map(cat => `
      <button class="modal-cat-option ${cat === selectedCat ? 'selected' : ''}"
              data-cat="${cat}">
        ${cat} ${savedCards.filter(c => (c.userCat || c.c) === cat).length > 0
          ? '(' + savedCards.filter(c => (c.userCat || c.c) === cat).length + ')'
          : ''}
      </button>
    `).join('');

    catList.querySelectorAll('.modal-cat-option').forEach(btn => {
      btn.addEventListener('click', () => {
        catList.querySelectorAll('.modal-cat-option').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedCat = btn.dataset.cat;
      });
    });

    // Custom category input
    document.getElementById('new-cat-btn').onclick = () => {
      const input = document.getElementById('new-cat-input');
      const name = input.value.trim();
      if (name) {
        if (!customCategories.includes(name)) {
          customCategories.push(name);
          save();
        }
        selectedCat = name;
        input.value = '';
        // Re-render categories with new one selected
        showAddModal(word);
        // Re-select it
        setTimeout(() => {
          catList.querySelectorAll('.modal-cat-option').forEach(b => {
            b.classList.remove('selected');
            if (b.dataset.cat === name) b.classList.add('selected');
          });
        }, 50);
      }
    };

    // Save button
    document.getElementById('btn-modal-save').onclick = () => {
      addCard(word, selectedCat);
      overlay.classList.remove('visible');
      showToast(`Added "${word.s}" to ${selectedCat}`);
      // Re-render search results to show checkmark
      const q = document.getElementById('search-input').value;
      if (q) renderSearchResults(searchDictionary(q));
    };

    // Cancel button
    document.getElementById('btn-modal-cancel').onclick = () => {
      overlay.classList.remove('visible');
    };

    overlay.classList.add('visible');

    // Close on backdrop click
    overlay.onclick = (e) => {
      if (e.target === overlay) overlay.classList.remove('visible');
    };
  }

  // ===== STUDY PAGE =====
  function renderStudyPage() {
    const container = document.getElementById('study-content');

    if (savedCards.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">&#x1F4DA;</div>
          <p>No cards saved yet!<br>Go to <b>Search</b> to find words and add them to your deck.</p>
        </div>
      `;
      return;
    }

    // Get categories with counts
    const catCounts = {};
    savedCards.forEach(c => {
      const cat = c.userCat || c.c;
      catCounts[cat] = (catCounts[cat] || 0) + 1;
    });

    const categories = Object.keys(catCounts).sort();

    // Build deck
    studyDeck = studyCategory === 'All'
      ? [...savedCards]
      : savedCards.filter(c => (c.userCat || c.c) === studyCategory);

    if (studyIndex >= studyDeck.length) studyIndex = 0;

    const card = studyDeck[studyIndex];

    container.innerHTML = `
      <div class="category-selector">
        <button class="category-chip ${studyCategory === 'All' ? 'active' : ''}" data-cat="All">
          All<span class="chip-count">${savedCards.length}</span>
        </button>
        ${categories.map(cat => `
          <button class="category-chip ${studyCategory === cat ? 'active' : ''}" data-cat="${cat}">
            ${cat}<span class="chip-count">${catCounts[cat]}</span>
          </button>
        `).join('')}
      </div>

      ${studyDeck.length > 0 ? `
        <div class="study-header">
          <h2>Study Cards</h2>
          <div class="study-counter">${studyIndex + 1} / ${studyDeck.length}</div>
        </div>

        <div class="flashcard-container">
          <div class="flashcard" id="flashcard">
            <div class="flashcard-face flashcard-front">
              <div class="card-chinese">${card.s}</div>
              <div class="card-pinyin">${card.p}</div>
              <div class="card-tap-hint">tap to flip</div>
            </div>
            <div class="flashcard-face flashcard-back">
              <div class="card-back-chinese">${card.s}</div>
              <div class="card-back-pinyin">${card.p}</div>
              <div class="card-back-english">${card.e}</div>
              <div class="card-tap-hint">tap to flip back</div>
            </div>
          </div>
        </div>

        <div class="flashcard-controls">
          <button class="btn-card-nav btn-prev" id="btn-prev">&larr; Prev</button>
          <button class="btn-card-nav btn-shuffle" id="btn-shuffle">Shuffle</button>
          <button class="btn-card-nav btn-next" id="btn-next">Next &rarr;</button>
        </div>
      ` : `
        <div class="empty-state">
          <div class="empty-icon">&#x1F4AD;</div>
          <p>No cards in this category.</p>
        </div>
      `}
    `;

    // Category chip handlers
    container.querySelectorAll('.category-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        studyCategory = chip.dataset.cat;
        studyIndex = 0;
        renderStudyPage();
      });
    });

    // Flashcard flip
    const flashcard = document.getElementById('flashcard');
    if (flashcard) {
      flashcard.addEventListener('click', () => {
        flashcard.classList.toggle('flipped');
      });
    }

    // Nav buttons
    const btnPrev = document.getElementById('btn-prev');
    const btnNext = document.getElementById('btn-next');
    const btnShuffle = document.getElementById('btn-shuffle');

    if (btnPrev) {
      btnPrev.addEventListener('click', () => {
        studyIndex = (studyIndex - 1 + studyDeck.length) % studyDeck.length;
        renderStudyPage();
      });
    }

    if (btnNext) {
      btnNext.addEventListener('click', () => {
        studyIndex = (studyIndex + 1) % studyDeck.length;
        renderStudyPage();
      });
    }

    if (btnShuffle) {
      btnShuffle.addEventListener('click', () => {
        // Fisher-Yates on savedCards of this category
        for (let i = studyDeck.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [studyDeck[i], studyDeck[j]] = [studyDeck[j], studyDeck[i]];
        }
        studyIndex = 0;
        showToast('Deck shuffled!');
        renderStudyPage();
      });
    }

    // Swipe support
    if (flashcard) {
      let startX = 0;
      flashcard.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, {passive: true});
      flashcard.addEventListener('touchend', e => {
        const dx = e.changedTouches[0].clientX - startX;
        if (Math.abs(dx) > 50) {
          if (dx > 0) {
            studyIndex = (studyIndex - 1 + studyDeck.length) % studyDeck.length;
          } else {
            studyIndex = (studyIndex + 1) % studyDeck.length;
          }
          renderStudyPage();
        }
      }, {passive: true});
    }
  }

  // ===== QUIZ PAGE =====
  let quizMode = 'cn-to-en'; // or 'en-to-cn'

  function renderQuizSetup() {
    const container = document.getElementById('quiz-content');

    if (savedCards.length < 4) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">&#x1F3AF;</div>
          <p>You need at least <b>4 saved cards</b> to start a quiz.<br>
          Currently: ${savedCards.length} card${savedCards.length !== 1 ? 's' : ''}</p>
        </div>
      `;
      return;
    }

    // Get categories
    const catCounts = {};
    savedCards.forEach(c => {
      const cat = c.userCat || c.c;
      catCounts[cat] = (catCounts[cat] || 0) + 1;
    });
    const categories = Object.keys(catCounts).sort();

    container.innerHTML = `
      <div class="quiz-setup">
        <h2>Quiz Mode</h2>
        <div class="quiz-mode-select">
          <button class="quiz-mode-btn ${quizMode === 'cn-to-en' ? 'active' : ''}" data-mode="cn-to-en">
            Chinese &rarr; English
          </button>
          <button class="quiz-mode-btn ${quizMode === 'en-to-cn' ? 'active' : ''}" data-mode="en-to-cn">
            English &rarr; Chinese
          </button>
        </div>

        <div class="category-selector" style="justify-content:center;margin-bottom:20px">
          <button class="category-chip ${studyCategory === 'All' ? 'active' : ''}" data-cat="All">
            All<span class="chip-count">${savedCards.length}</span>
          </button>
          ${categories.map(cat => `
            <button class="category-chip ${studyCategory === cat ? 'active' : ''}" data-cat="${cat}">
              ${cat}<span class="chip-count">${catCounts[cat]}</span>
            </button>
          `).join('')}
        </div>

        <button class="btn-start-quiz" id="btn-start-quiz">
          Start Quiz (${studyCategory === 'All' ? savedCards.length : (catCounts[studyCategory] || 0)} cards)
        </button>
      </div>
    `;

    // Mode buttons
    container.querySelectorAll('.quiz-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        quizMode = btn.dataset.mode;
        renderQuizSetup();
      });
    });

    // Category chips
    container.querySelectorAll('.category-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        studyCategory = chip.dataset.cat;
        renderQuizSetup();
      });
    });

    // Start button
    const pool = studyCategory === 'All'
      ? savedCards
      : savedCards.filter(c => (c.userCat || c.c) === studyCategory);

    const startBtn = document.getElementById('btn-start-quiz');
    if (pool.length < 4) {
      startBtn.disabled = true;
      startBtn.textContent = 'Need at least 4 cards in this category';
    }

    startBtn.addEventListener('click', () => {
      startQuiz(pool);
    });
  }

  function startQuiz(pool) {
    // Shuffle pool
    const shuffled = [...pool];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    quizState = {
      questions: shuffled.slice(0, Math.min(10, shuffled.length)),
      pool: pool,
      current: 0,
      score: 0,
      answered: false
    };

    renderQuizQuestion();
  }

  function renderQuizQuestion() {
    const container = document.getElementById('quiz-content');
    const qs = quizState;

    if (qs.current >= qs.questions.length) {
      renderQuizResults();
      return;
    }

    const question = qs.questions[qs.current];
    const total = qs.questions.length;
    const progress = ((qs.current) / total) * 100;

    // Generate 4 choices (1 correct + 3 wrong)
    let choices = [question];
    const otherCards = qs.pool.filter(c => c.s !== question.s);
    // Shuffle others
    for (let i = otherCards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [otherCards[i], otherCards[j]] = [otherCards[j], otherCards[i]];
    }

    // Pick 3 unique wrong answers
    for (let i = 0; i < otherCards.length && choices.length < 4; i++) {
      if (quizMode === 'cn-to-en') {
        if (!choices.some(c => c.e === otherCards[i].e)) {
          choices.push(otherCards[i]);
        }
      } else {
        if (!choices.some(c => c.s === otherCards[i].s)) {
          choices.push(otherCards[i]);
        }
      }
    }

    // Shuffle choices
    for (let i = choices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [choices[i], choices[j]] = [choices[j], choices[i]];
    }

    container.innerHTML = `
      <div class="quiz-active">
        <div class="quiz-progress">
          <span>${qs.current + 1}/${total}</span>
          <div class="quiz-progress-bar">
            <div class="quiz-progress-fill" style="width:${progress}%"></div>
          </div>
          <span class="quiz-score">${qs.score} correct</span>
        </div>

        <div class="quiz-prompt">
          ${quizMode === 'cn-to-en' ? `
            <div class="quiz-prompt-chinese">${question.s}</div>
            <div class="quiz-prompt-pinyin">${question.p}</div>
          ` : `
            <div class="quiz-prompt-english">${question.e}</div>
          `}
        </div>

        <div class="quiz-choices">
          ${choices.map((choice, i) => `
            <button class="quiz-choice" data-idx="${i}" data-correct="${choice.s === question.s}">
              ${quizMode === 'cn-to-en' ? choice.e : `${choice.s} (${choice.p})`}
            </button>
          `).join('')}
        </div>

        <button class="quiz-next-btn" id="quiz-next-btn">Next Question &rarr;</button>
      </div>
    `;

    // Choice handlers
    container.querySelectorAll('.quiz-choice').forEach(btn => {
      btn.addEventListener('click', () => {
        if (qs.answered) return;
        qs.answered = true;

        const correct = btn.dataset.correct === 'true';
        if (correct) {
          qs.score++;
          btn.classList.add('correct');
        } else {
          btn.classList.add('wrong');
          // Show correct answer
          container.querySelectorAll('.quiz-choice').forEach(b => {
            if (b.dataset.correct === 'true') b.classList.add('correct');
            b.classList.add('disabled');
          });
        }

        container.querySelectorAll('.quiz-choice').forEach(b => b.classList.add('disabled'));
        document.getElementById('quiz-next-btn').classList.add('visible');
      });
    });

    // Next button
    document.getElementById('quiz-next-btn').addEventListener('click', () => {
      qs.current++;
      qs.answered = false;
      renderQuizQuestion();
    });
  }

  function renderQuizResults() {
    const container = document.getElementById('quiz-content');
    const qs = quizState;
    const pct = Math.round((qs.score / qs.questions.length) * 100);
    let message = '';
    if (pct === 100) message = 'Perfect score! You\'re amazing!';
    else if (pct >= 80) message = 'Great job! Keep it up!';
    else if (pct >= 60) message = 'Good effort! Practice makes perfect.';
    else message = 'Keep studying! You\'ll get there.';

    container.innerHTML = `
      <div class="quiz-results">
        <h2>Quiz Complete!</h2>
        <div class="quiz-final-score">
          ${qs.score} <span>/ ${qs.questions.length}</span>
        </div>
        <div class="quiz-results-message">${message}</div>
        <button class="btn-start-quiz" onclick="document.querySelector('[data-page=quiz]').click()">
          Try Again
        </button>
      </div>
    `;
  }

  // ===== MY CARDS PAGE =====
  function renderMyCards() {
    const container = document.getElementById('mycards-content');
    const detail = document.getElementById('category-detail');
    detail.classList.remove('active');

    if (savedCards.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">&#x1F4E6;</div>
          <p>No saved cards yet.<br>Search for words and add them to get started!</p>
        </div>
      `;
      return;
    }

    // Group by category
    const groups = {};
    savedCards.forEach(c => {
      const cat = c.userCat || c.c;
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(c);
    });

    const categories = Object.keys(groups).sort();

    container.innerHTML = `
      <div class="my-cards-header">
        <h2>My Cards</h2>
        <span class="total-count">${savedCards.length} total</span>
      </div>
      <div class="my-cards-categories">
        ${categories.map(cat => `
          <div class="my-category-card" data-cat="${cat}">
            <div class="my-cat-info">
              <div class="my-cat-icon" style="background:${getCatColor(cat)}">
                ${cat.charAt(0).toUpperCase()}
              </div>
              <div>
                <div class="my-cat-name">${cat}</div>
                <div class="my-cat-count">${groups[cat].length} word${groups[cat].length !== 1 ? 's' : ''}</div>
              </div>
            </div>
            <div class="my-cat-arrow">&rsaquo;</div>
          </div>
        `).join('')}
      </div>
    `;

    // Category click -> show detail
    container.querySelectorAll('.my-category-card').forEach(card => {
      card.addEventListener('click', () => {
        showCategoryDetail(card.dataset.cat, groups[card.dataset.cat]);
      });
    });
  }

  function showCategoryDetail(category, words) {
    detailCategory = category;
    const detail = document.getElementById('category-detail');
    const container = document.getElementById('mycards-content');

    container.innerHTML = '';
    detail.classList.add('active');

    detail.innerHTML = `
      <div class="detail-header">
        <button class="btn-back" id="btn-back-detail">&larr;</button>
        <h3>${category} (${words.length})</h3>
      </div>
      <div class="word-list">
        ${words.map(word => `
          <div class="word-item">
            <div class="word-item-info">
              <div class="word-item-chinese">${word.s}</div>
              <div class="word-item-pinyin">${word.p}</div>
              <div class="word-item-english">${word.e}</div>
            </div>
            <button class="btn-remove" data-word="${encodeURIComponent(JSON.stringify(word))}">&#x2715;</button>
          </div>
        `).join('')}
      </div>
    `;

    // Back button
    document.getElementById('btn-back-detail').addEventListener('click', () => {
      detail.classList.remove('active');
      renderMyCards();
    });

    // Remove buttons
    detail.querySelectorAll('.btn-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const word = JSON.parse(decodeURIComponent(btn.dataset.word));
        removeCard(word);
        showToast(`Removed "${word.s}"`);
        // Refresh
        const remaining = savedCards.filter(c => (c.userCat || c.c) === category);
        if (remaining.length === 0) {
          detail.classList.remove('active');
          renderMyCards();
        } else {
          showCategoryDetail(category, remaining);
        }
      });
    });
  }

  // ===== INIT =====
  function init() {
    // Nav handlers
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => navigate(btn.dataset.page));
    });

    // Search input
    const searchInput = document.getElementById('search-input');
    let debounceTimer;
    searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const q = searchInput.value.trim();
        if (q.length > 0) {
          renderSearchResults(searchDictionary(q));
        } else {
          document.getElementById('search-results').innerHTML = '';
        }
      }, 200);
    });

    // Start on search page
    updateStats();
    navigate('search');

    // Keyboard support for search
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        searchInput.value = '';
        document.getElementById('search-results').innerHTML = '';
        searchInput.blur();
      }
    });
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Register service worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
})();
