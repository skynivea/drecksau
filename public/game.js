const socket = io();
let myRoomCode = '';
let myId = '';

function createRoom() {
    const randomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
    document.getElementById('roomInput').value = randomCode;
    joinRoom();
}

function joinRoom() {
    const input = document.getElementById('roomInput').value;
    if(input) {
        myRoomCode = input;
        socket.emit('joinRoom', myRoomCode);
        document.getElementById('lobby').style.display = 'none';
        document.getElementById('waiting-room').style.display = 'block';
        document.getElementById('display-room-code').innerText = myRoomCode;
        document.getElementById('board-room-code').innerText = myRoomCode;
    }
}

function startGame() {
    socket.emit('startGame', myRoomCode);
}

function playMyCard(cardIdx) {
    socket.emit('playCard', { roomCode: myRoomCode, cardIdx: cardIdx });
}

socket.on('gameStarted', () => {
    document.getElementById('waiting-room').style.display = 'none';
    document.getElementById('game-board').style.display = 'flex';
});

socket.on('updateState', (room) => {
    myId = socket.id;
    document.getElementById('player-count').innerText = room.players.length;

    if (room.isStarted) {
        document.getElementById('waiting-room').style.display = 'none';
        document.getElementById('game-board').style.display = 'flex';

        const me = room.players.find(p => p.id === myId);
        if (me) {
            const pigsDiv = document.getElementById('my-pigs');
            pigsDiv.innerHTML = '';
            me.pigs.forEach(pig => {
                const pigElem = document.createElement('div');
                pigElem.className = 'card ' + (pig.isDirty ? 'pig-dirty' : 'pig-clean');
                pigsDiv.appendChild(pigElem);
            });

            const handDiv = document.getElementById('my-hand');
            handDiv.innerHTML = '';
            me.hand.forEach((cardName, idx) => {
                const cardElem = document.createElement('div');
                cardElem.className = 'card card-' + cardName;
                cardElem.onclick = () => playMyCard(idx);
                handDiv.appendChild(cardElem);
            });
        }

        const centerDisplay = document.getElementById('played-card-display');
        if (room.centerCard) {
            centerDisplay.className = 'card card-' + room.centerCard;
            centerDisplay.style.opacity = '1';
        } else {
            centerDisplay.style.opacity = '0';
        }
    }
});

socket.on('errorMsg', (msg) => {
    alert(msg);
});

socket.on('gameOver', (msg) => {
    alert(msg);
    location.reload();
});
