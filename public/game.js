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
    
    // 1. 내 돼지들 렌더링
    const pigsDiv = document.getElementById('my-pigs');
    pigsDiv.innerHTML = '';
    me.pigs.forEach((pig, idx) => {
        const pigElem = document.createElement('div');
        // 더럽냐 깨끗하냐에 따라 클래스(이미지) 다르게 적용
        pigElem.className = 'card ' + (pig.isDirty ? 'pig-dirty' : 'pig-clean'); 
        pigsDiv.appendChild(pigElem);
    });

    // 2. 내 핸드 카드 렌더링
    const handDiv = document.getElementById('my-hand');
    handDiv.innerHTML = '';
    me.hand.forEach((cardName, idx) => {
        const cardElem = document.createElement('div');
        // 예: card-mud, card-rain 클래스 적용
        cardElem.className = 'card card-' + cardName; 
        cardElem.onclick = () => playMyCard(idx);
        handDiv.appendChild(cardElem);
    });

    // 3. 중앙에 플레이된 카드 표시
    const centerDisplay = document.getElementById('played-card-display');
    if (room.centerCard) {
        centerDisplay.className = 'card card-' + room.centerCard;
        centerDisplay.style.opacity = 1;
        centerDisplay.style.border = "none"; // 이미지가 꽉 차게 테두리 제거
    } else {
        centerDisplay.style.opacity = 0;
        centerDisplay.className = ''; 
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
