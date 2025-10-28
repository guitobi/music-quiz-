const socket = io(); 

socket.emit('hello', 'Hello from client');
socket.on('response', data => console.log(data));

const btnEl = document.querySelector('.btn');
const inputEl = document.querySelector('#messageInput');
const divEl = document.querySelector('.message');

btnEl.addEventListener('click', () => {
    socket.emit('message', inputEl.value);
    inputEl.value = '';
});

socket.on('message', data => {
    console.log(data);
    const p = document.createElement('p');
    p.textContent = data;
    divEl.appendChild(p);
});