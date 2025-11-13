const socket = io(); 

let currentRoom = null;
let currentUserNickname = null;
let isHost = false;

socket.emit('hello', 'Hello from client');
socket.on('response', data => console.log(data));

const messageSendBtnEl = document.querySelector('.btn');
const inputEl = document.querySelector('#messageInput');
const chatDivEl = document.querySelector('.messageContainer');
const createRoomBtn = document.querySelector('.createRoom');
const joinRoomBtn = document.querySelector('.joinRoom');
const startGameBtn = document.querySelector('.startGame');
const nameInputEl = document.querySelector('.nameInput');
const errorDiv = document.querySelector('.error-div');
const roomInfo = document.querySelector('.roomInfo');
const playersListDiv = document.getElementById('playerList');
const roomCodeInput = document.querySelector('.roomCode');

socket.on('message', ({userNickname, text}) => {
    console.log('Отримав повідомлення:', `${userNickname}: ${text}`);
    const p = document.createElement('p');
    p.textContent = `${userNickname}: ${text}`;
    chatDivEl.appendChild(p);
});

socket.on('room-joined', ({userNickname, roomCode, Host}) => {
    // if (isHost) isHost = true;
    isHost = Host;
    if (isHost) startGameBtn.hidden = false;
    currentRoom = roomCode;
    roomInfo.textContent = `${userNickname.trim()} приєднався до: ${roomCode}`;
    nameInputEl.value = '';
    roomCodeInput.value = '';
});

socket.on('players-update', players => {
    playersListDiv.innerText = players.map(p => `${p.name}`).join('\n');
});

socket.on('game-started', ({ roomCode }) => {
    window.location.href = `game.html?roomCode=${roomCode}&nickname=${currentUserNickname}`;
});

socket.on('error-nickname-taken', () => {
    errorDiv.textContent = `This nickname is alredy taken.(єбать ти лох, точно шось з хохлами хотів, та?)`;
});

const createRoom = async () => {
    // isHost = true;
    // startGameBtn.hidden = true;
    errorDiv.innerHTML =  '';
    const userNickname = nameInputEl.value.trim();
    if(userNickname === '') {
        const errorP = document.createElement('p');
        errorP.textContent = 'Enter a valid nickname';
        errorDiv.appendChild(errorP);
        return;
    } else {
        try {
            currentUserNickname = userNickname;
            const res = await fetch('/api/rooms', {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                playerName: currentUserNickname
            })
            });
            const data = await res.json();
            const roomCodeParsed = data.roomCode;
            socket.emit('join-room', {userNickname, roomCode: roomCodeParsed});
            // startGameBtn.removeAttribute('hidden');
        } catch (err) {
            console.error(err);
        }
    };
};

const joinRoom = async () => {
    console.log(`Checking Nickname: "${nameInputEl.value}", Room Code: "${roomCodeInput.value}"`);
    errorDiv.innerHTML =  '';
    const userNickname = nameInputEl.value.trim();
    const roomCode = roomCodeInput.value.trim();
    if(userNickname === '' || roomCode === '') {
        const errorP = document.createElement('p');
        errorP.textContent = 'Enter a valid nickname or room code!';
        errorDiv.appendChild(errorP);
        return;
    } else {
        try {
        const res = await fetch(`/api/rooms/${roomCode}`);
        if (!res.ok) {
            errorDiv.textContent = `ЖОПА з вашим json`
            return;
        };
        const data = await res.json();
        if (!data.exists) {
            errorDiv.textContent = 'ЖОПЖОПА з вашим json ( ігор )';
            return;
        };
        socket.emit('join-room', {userNickname, roomCode});
        currentRoom = roomCode;
        currentUserNickname = userNickname;
        roomCodeInput.value = '';
        nameInputEl.value = '';
        } catch (err) {
        console.error(err);
        }
    } 
};

const startGame = () => {
    socket.emit('start-game', {roomCode: currentRoom});
};

messageSendBtnEl.addEventListener('click', () => {
        if (!currentRoom) {
        alert('У тебе немає друзів');
        return;
    }
    
    socket.emit('message', {
        userNickname: currentUserNickname,
        roomCode: currentRoom,
        text: inputEl.value
    });
    inputEl.value = '';
});

createRoomBtn.addEventListener('click', createRoom);
joinRoomBtn.addEventListener('click', joinRoom);
startGameBtn.addEventListener('click', startGame);
