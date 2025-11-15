const socket = io();

const playersListContainer = document.querySelector('#playersList .player-list-items');
const startBtnDiv = document.querySelector('.startBtn');
const questionField = document.querySelector('.questionField');
const audioPlayer = document.querySelector('#audioPlayer');
const volumeSlider = document.querySelector('#volumeSlider');
const createBtn = document.querySelector("#startRoundBtn");
const answerResultContainer = document.createElement('div');

const params = new URLSearchParams(window.location.search);
const roomCode = params.get('roomCode');
const nickname = params.get('nickname');

let currentQuestion = null;
let hasAnswered = false;
let isHost = false;
let roundTimer = null;

socket.on('players-update', players => {
    playersListContainer.innerHTML = ''; 
    players.forEach(p => {
        const playerEl = document.createElement('div');
        playerEl.className = 'player-item';
        playerEl.innerHTML = `
            <span class="name">${p.name}</span>
            <span class="score">${p.score} 🏆</span>
        `;
        playersListContainer.appendChild(playerEl);
    });
});

socket.on('new-round', ({ question, currentRound, totalRounds, url }) => {
    audioPlayer.volume = volumeSlider.value;
    audioPlayer.src = url;
    audioPlayer.play();
    renderQuestionRoom(question, currentRound, totalRounds);
    createTimer();
});

socket.on('submit-result', result => {
    const res = document.createElement('p');
    answerResultContainer.innerHTML = '';
    answerResultContainer.textContent = result;
    questionField.appendChild(answerResultContainer);
    answerResultContainer.appendChild(res);
});

socket.on('round-over', ({ results, correctAnswer }) => {
    if (roundTimer) clearInterval(roundTimer);
    audioPlayer.pause();

    playersListContainer.innerHTML = '';
    results.forEach(p => {
        const icon = p.isCorrectAnswer ? '✅' : '❌';
        const playerEl = document.createElement('div');
        playerEl.className = 'player-item';
        playerEl.innerHTML = `
            <span class="name">${p.name}</span>
            <span class="score">${p.score} 🏆</span>
            <span class="result-icon">${icon}</span>
        `;
        playersListContainer.appendChild(playerEl);
    });

    // Використовуємо correctAnswer з сервера
    if (correctAnswer) {
        const questionH = questionField.querySelector('h3');
        if (questionH) { 
            questionH.innerHTML = `Correct was: <span class="highlight">${correctAnswer.artistName}</span> - ${correctAnswer.trackName}`;
        }
    }

    // Показуємо кнопку хосту (навіть якщо він перезавантажив сторінку)
    if (isHost === true) {
        createBtn.textContent = 'Next Round';
        createBtn.hidden = false;
        // Перевіряємо чи кнопка вже є в questionField
        if (!questionField.contains(createBtn)) {
            questionField.appendChild(createBtn);
        }
    }
});

socket.on('game-over', ({ finalScores }) => {
    questionField.innerHTML = ''; 
    createBtn.hidden = true;
    
    const gameOverTitle = document.createElement('h2');
    gameOverTitle.textContent = 'Game Over!';
    const winnerText = document.createElement('p');
    winnerText.textContent = `${finalScores[0].name} is a winner!`;
    winnerText.style.fontSize = '1.2rem';
    
    questionField.appendChild(gameOverTitle);
    questionField.appendChild(winnerText);

    playersListContainer.innerHTML = '';
    finalScores.forEach(p => {
        const playerEl = document.createElement('div');
        playerEl.className = 'player-item';
        playerEl.innerHTML = `
            <span class="name">${p.name}</span>
            <span class="score">${p.score} 🏆</span>
        `;
        playersListContainer.appendChild(playerEl);
    });

    if (isHost) {
        createBtn.textContent = `Play Again?`;
        createBtn.hidden = false;
        questionField.appendChild(createBtn); 
    }
});

socket.on('new-host', () => {
    isHost = true;
});

socket.on('sync-game-state', ({ currentRound, totalRounds, curQuestion, timeLeft, audioUrl }) => {
    console.log
    currentQuestion = curQuestion;
    renderQuestionRoom(curQuestion, currentRound, totalRounds);
    
    // Запускаємо аудіо якщо є URL
    if (audioUrl) {
        audioPlayer.src = audioUrl;
        audioPlayer.play().catch(err => {
            console.log('Autoplay blocked:', err);
        });
    }
    
    // Створюємо таймер з правильним часом
    createTimerWithTime(timeLeft || 15);
});

socket.on('room-joined', ({userNickname, roomCode, Host }) => {
    isHost = Host;
    // Показуємо кнопку тільки якщо гра не почалась
    if (isHost && !document.querySelector('#timer') && currentQuestion === null && questionField.querySelector('h3')?.textContent !== 'Loading questions...') { 
        createBtn.textContent = 'Start Round';
        createBtn.hidden = false;
        questionField.appendChild(createBtn); 
    }
});

socket.on('error-message', (message) => {
    alert(message);
});

socket.on('game-started', ({ roomCode }) => {
    window.location.href = `game.html?roomCode=${roomCode}&nickname=${nickname}`;
});

socket.on('loading-question', (roomCode) => {
    questionField.innerHTML = `<h3>Loading questions...</h3>`;
});

socket.emit('rejoin-room', { userNickname: nickname, roomCode: roomCode });

const startRound = () => {
    console.log(`ПЕРЕД старт раунд`);
    socket.emit('start-round', roomCode);
    createBtn.hidden = true;
};

const renderQuestionRoom = (question, currentRound, totalRounds) => {
    currentQuestion = question;
    hasAnswered = false;
    questionField.innerHTML = ''; 

    const roundP = document.createElement('p');
    roundP.className = 'round-info';
    roundP.textContent = `Round ${currentRound} / ${totalRounds}`;

    const questionH = document.createElement('h3');
    questionH.textContent = "Guess the Artist!";
    
    questionField.appendChild(roundP);
    questionField.appendChild(questionH);

    const optionsGrid = document.createElement('div');
    optionsGrid.className = 'options-grid';

    question.options.forEach(option => {
        const button = document.createElement('button');
        button.dataset.artist = option;
        button.textContent = option;
        optionsGrid.appendChild(button); 
    });

    questionField.appendChild(optionsGrid); 
};

const createTimer = () => {
    createTimerWithTime(15);
};

const createTimerWithTime = (seconds) => {
    const timerEl = document.createElement('div');
    timerEl.id = 'timer'; 
    timerEl.textContent = seconds;
    
    questionField.prepend(timerEl);

    if (roundTimer) clearInterval(roundTimer);

    roundTimer = setInterval(() => {
        let current = parseInt(timerEl.textContent, 10);
        if (current <= 0) {
            clearInterval(roundTimer);
        } else {
            timerEl.textContent = current - 1;
        }
    }, 1000);
};

createBtn.addEventListener('click', () => {
    if (createBtn.textContent === 'Start Round') {
        startRound();
    } else if (createBtn.textContent === 'Play Again?') {
        socket.emit('play-again', { roomCode: roomCode });
        createBtn.hidden = true;
    } else if (createBtn.textContent === 'Next Round') {
        socket.emit('next-round', roomCode);
        createBtn.hidden = true;
    }   
});

questionField.addEventListener('click', (e) => {
    if (hasAnswered === true) return;
    
    if (e.target.tagName === 'BUTTON' && e.target.closest('.options-grid')) {

        if (roundTimer) clearInterval(roundTimer);
        
        audioPlayer.pause();
        const answer = e.target.dataset.artist;
        hasAnswered = true;
        
        const allButtons = questionField.querySelectorAll('.options-grid button');
        allButtons.forEach(btn => btn.disabled = true);
        
        e.target.style.backgroundColor = 'var(--accent-dark-hover)';
        e.target.style.color = 'var(--text-light)';

        socket.emit('submit-button', {roomCode, nickname, answer});
    };
});

volumeSlider.addEventListener('input', () => {
    audioPlayer.volume = volumeSlider.value;
});

audioPlayer.addEventListener('ended', () => {
    clearInterval(roundTimer);
});