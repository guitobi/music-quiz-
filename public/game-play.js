const socket = io();

const playersList = document.querySelector('#playersList');
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
    playersList.innerText = players.map(p => `${p.name}: ${p.score}🏆`).join('\n');
});

socket.on('new-round', ({ question, currentRound, totalRounds, url }) => {
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

socket.on('round-over', ({ results }) => {
    if (roundTimer) clearInterval(roundTimer);
    audioPlayer.pause();
    if (isHost === true) {
        createBtn.hidden = false;
        createBtn.textContent = 'Next Round';
    }

    const resultsHtml = results.map(p => {
        const icon = p.isCorrectAnswer ? '✅' : '❌'; 
        return `<div>${p.name}: ${p.score} 🏆 ${icon}</div>`;
    }).join(''); // 

    playersList.innerHTML = resultsHtml;
    const questionH = questionField.querySelector('h3');
    const artistNameStr = document.createElement('span');

    questionH.style.fontWeight = '400';
    artistNameStr.style.fontWeight = '900';
    artistNameStr.textContent = `${currentQuestion.artistName}`;
    questionH.textContent = `Correct was: ${artistNameStr.textContent} - ${currentQuestion.trackName}`;
});

// socket.on('play-track', ({ url }) => {
    
// });

socket.on('game-over', ({ finalScores }) => {
    questionField.innerText = '';
    createBtn.hidden = true;
    questionField.innerText = `Game Over!\n`;
    questionField.innerText += `${finalScores[0].name} is a winner!`;
    playersList.innerText = finalScores.map(p => `${p.name}: ${p.score} 🏆`).join('\n');
    if (isHost) {
        createBtn.textContent = `Play Again?`;
        createBtn.hidden = false;
    }
});

socket.on('new-host', () => {
    isHost = true;
    createBtn.hidden = false;
});

socket.on('sync-game-state', ({ currentRound, totalRounds, curQuestion}) => {
    renderQuestionRoom(curQuestion, currentRound, totalRounds);
    createTimer();
});

socket.on('room-joined', ({userNickname, roomCode, Host }) => {
    isHost = Host;
    if (isHost) {
        createBtn.textContent = 'Start Round';
        createBtn.hidden = false;
    }
});

socket.on('error-message', (message) => {
    alert(message);
});

socket.on('game-started', ({ roomCode }) => {
    window.location.href = `game.html?roomCode=${roomCode}&nickname=${nickname}`;
});

socket.on('loading-question', (roomCode) => {
    questionField.textContent = `Loading questions...`;
    // socket.emit('new-round', roomCode);
});

socket.emit('rejoin-room', { userNickname: nickname, roomCode: roomCode });

// const createStartBtn = () => {
//     if (isHost === true) {
//         createBtn.textContent = 'Start Round'
//         startBtnDiv.appendChild(createBtn);
//         createBtn.addEventListener('click', startRound);
//     }
// };

const startRound = () => {
    socket.emit('start-round', roomCode);
    createBtn.hidden = true;
};

const renderQuestionRoom = (question, currentRound, totalRounds) => {
    currentQuestion = question;
        hasAnswered = false;
        const questionH = document.createElement('h3');
        const roundP = `<p>Round ${currentRound} / ${totalRounds}</p>`
        questionField.innerHTML = '';
        questionH.textContent = "Guess the Artist!";
        questionField.appendChild(questionH);
        questionField.insertAdjacentHTML('afterbegin', roundP);
        question.options.forEach(option => {
            const markup = `
                <button data-artist="${option}">${option}</button>
                `
                questionField.insertAdjacentHTML('beforeend', markup);
        });
};

const createTimer = () => {
    const timerEl = document.createElement('div');
    timerEl.id = 'timer';
    timerEl.textContent = 15;
    questionField.insertAdjacentElement('afterbegin', timerEl);

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
    if (e.target.tagName === 'BUTTON') {

        if (roundTimer) clearInterval(roundTimer);

        audioPlayer.pause();
        const answer = e.target.dataset.artist;
        hasAnswered = true;
        // console.log(answer)
        socket.emit('submit-button', {roomCode, nickname, answer});
    };
});

volumeSlider.addEventListener('input', () => {
    audioPlayer.volume = volumeSlider.value;
});

audioPlayer.addEventListener('ended', () => {
    clearInterval(roundTimer);
});


