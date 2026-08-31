const socket = io();
let myRoomCode = '';
let myId = '';

function joinRoom() {
    const input = document.getElementById('roomInput').value;
    if(input) {
        myRoomCode = input;
        socket.emit('joinRoom', myRoomCode);
        document.getElementById('lobby').style.display = 'none';
        document.getElementById('game-board').style.display = 'flex';
        document.getElementById('display-room').innerText = myRoomCode;
    }
}

socket.on('updateState', (room) => {
    myId = socket.id;
    const me = room.players.find(p => p.id === myId);
    
    // 내 핸드 렌더링
    const handDiv = document.getElementById('my-hand');
    handDiv.innerHTML = '';
    me.hand.forEach((card, idx) => {
        const cardElem = document.createElement('div');
        cardElem.className = 'card';
        cardElem.innerText = card; // 실제 구현시에는 background-image로 이미지 교체
        cardElem.onclick = () => playMyCard(idx);
        handDiv.appendChild(cardElem);
    });

    // 중앙에 플레이된 카드 표시 (모두가 볼 수 있게)
    const centerDisplay = document.getElementById('played-card-display');
    if (room.centerCard) {
        centerDisplay.innerText = room.centerCard;
        centerDisplay.style.opacity = 1;
        // 일정 시간 후 사라지게 하려면 setTimeout 사용
    } else {
        centerDisplay.style.opacity = 0;
    }
});

function playMyCard(cardIdx) {
    // 실제 게임에서는 타겟팅 UI 로직이 여기에 추가됩니다.
    // 임시로 타겟 정보 없이 전송
    const targetInfo = { targetPlayerId: null, targetPigIdx: null }; 
    socket.emit('playCard', { roomCode: myRoomCode, cardIdx: cardIdx, targetInfo: targetInfo });
}

socket.on('gameOver', (msg) => {
    alert(msg);
    location.reload();
});
