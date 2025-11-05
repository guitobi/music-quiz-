const socket = io();

const playersList = document.querySelector('#playersList');
const startBtnDiv = document.querySelector('.startBtn');
const questionField = document.querySelector('.questionField');
const createBtn = document.createElement('button');
const answerResultContainer = document.createElement('div');

const params = new URLSearchParams(window.location.search);
const roomCode = params.get('roomCode');
const nickname = params.get('nickname');
const isHost = params.get('isHost');

let currentQuestion = null;
let hasAnswered = false;

socket.on('players-update', namesArr => {
    playersList.textContent = namesArr.join(', \n');
});

socket.on('new-round', question => {
    currentQuestion = question;
    hasAnswered = false;
    const questionH = document.createElement('h3');
    questionField.innerHTML = '';
    questionH.textContent = question.trackName;
    questionField.appendChild(questionH);
    question.options.forEach(option => {
        const markup = `
            <button data-artist="${option}">${option}</button>
            `
            questionField.insertAdjacentHTML('beforeend', markup);
        });
});

socket.on('submit-result', result => {
    const res = document.createElement('p');
    answerResultContainer.innerHTML = '';
    answerResultContainer.textContent = result;
    questionField.appendChild(answerResultContainer);
    answerResultContainer.appendChild(res);
});

socket.on('round-over', () => {
    if (isHost === 'true') {
        createBtn.hidden = false;
    }
});

socket.emit('rejoin-room', {roomCode, nickname});

const createStartBtn = () => {
    if (isHost === 'true') {
        createBtn.id = "startRoundBtn";
        createBtn.textContent = 'Start Round'
        startBtnDiv.appendChild(createBtn);
        createBtn.addEventListener('click', startRound);
    }
};

const startRound = () => {
    socket.emit('start-round', roomCode);
    createBtn.hidden = true;
};

questionField.addEventListener('click', (e) => {
    if (hasAnswered === true) return;
    if (e.target.tagName === 'BUTTON') {
        const answer = e.target.dataset.artist;
        hasAnswered = true;
        // console.log(answer)
        socket.emit('submit-button', {roomCode, nickname, answer});
    };
});

createStartBtn();

