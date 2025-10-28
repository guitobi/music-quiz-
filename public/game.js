const socket = io(); 

let currentRoom = null;

socket.emit('hello', 'Hello from client');
socket.on('response', data => console.log(data));

const messageSendBtnEl = document.querySelector('.btn');
const inputEl = document.querySelector('#messageInput');
const chatDivEl = document.querySelector('.message');
const createRoomBtn = document.querySelector('.createRoom');
const joinRoomBtn = document.querySelector('.joinRoom');
const nameInputEl = document.querySelector('.nameInput');
const errorDiv = document.querySelector('.error-div');
const roomInfo = document.querySelector('.roomInfo');
const roomCodeInput = document.querySelector('.roomCode');

socket.on('message', (data) => {
    console.log('Отримав повідомлення:', data);
    const p = document.createElement('p');
    p.textContent = data;
    chatDivEl.appendChild(p);
});

socket.on('room-joined', (roomCode) => {
    currentRoom = roomCode;
    roomInfo.textContent = `Приєднався до: ${roomCode}`;
    nameInputEl.value = '';
    roomCodeInput.value = '';
});

socket.on('room-created', (roomCode) => {
    currentRoom = roomCode;
    roomInfo.textContent = `Твоя кімната: ${roomCode}`;
    nameInputEl.value = '';
});


const createRoom = () => {
    errorDiv.innerHTML =  '';
    const userNickname = nameInputEl.value.trim();
    if(userNickname === '') {
        const errorP = document.createElement('p');
        errorP.textContent = 'Enter a valid nickname';
        errorDiv.appendChild(errorP);
        return;
    } else {
        socket.emit('create-room', userNickname);
    }
};

const joinRoom = () => {
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
        socket.emit('join-room', {userNickname, roomCode});
        currentRoom = roomCode;
        roomCodeInput.value = '';
        nameInputEl.value = '';
    }
    
};

messageSendBtnEl.addEventListener('click', () => {
        if (!currentRoom) {
        alert('Спочатку створи або приєднайся до кімнати!');
        return;
    }
    
    socket.emit('message', {
        roomCode: currentRoom,
        text: inputEl.value
    });
    inputEl.value = '';
});

createRoomBtn.addEventListener('click', createRoom);
joinRoomBtn.addEventListener('click', joinRoom);







