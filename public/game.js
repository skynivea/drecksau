const socket = io();
let myRoomCode = '';
let myId = '';
let selectedCardIdx = null;

function createRoom() {
    const randomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
    document.getElementById('roomInput').value = randomCode;
    joinRoom();
}

function joinRoom() {
    const rawInput = document.getElementById('roomInput').value;
    if (rawInput) {
        // 공백 제거 및 대문자 강제 변환
        myRoomCode = rawInput.trim().toUpperCase(); 
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

function selectCard(idx, cardName) {
    selectedCardIdx = idx;
    
    // 비 카드는 대상을 지정하지 않고 바로 발동
    if (cardName === 'rain') {
        socket.emit('playCard', { roomCode: myRoomCode, cardIdx: idx });
        selectedCardIdx = null;
        return;
    }

    // UI 즉시 업데이트하여 선택 상태 표시
    const handCards = document.querySelectorAll('#my-hand .card');
    handCards.forEach((c, i) => {
        if (i === idx) c.classList.add('selected');
        else c.classList.remove('selected');
    });
}

function selectTargetPig(targetPlayerId, targetPigIdx) {
    if (selectedCardIdx === null) {
        alert('먼저 내 손에서 사용할 카드를 클릭하세요!');
        return;
    }

    socket.emit('playCard', { 
        roomCode: myRoomCode, 
        cardIdx: selectedCardIdx,
        targetPlayerId: targetPlayerId,
        targetPigIdx: targetPigIdx
    });

    selectedCardIdx = null;
}

function discardHand() {
    socket.emit('discardHand', { roomCode: myRoomCode });
    selectedCardIdx = null;
}

function renderPigElement(pig, ownerId, pigIdx) {
    const container = document.createElement('div');
    container.className = 'pig-container';
    container.onclick = () => selectTargetPig(ownerId, pigIdx);

    const pigCard = document.createElement('div');
    pigCard.className = 'card ' + (pig.isDirty ? 'pig-dirty' : 'pig-clean');
    container.appendChild(pigCard);

    if (pig.hasBarn) {
        const barn = document.createElement('div');
        barn.className = 'overlay-badge badge-barn';
        barn.innerText = '헛간';
        container.appendChild(barn);
    }
    if (pig.hasLightningRod) {
        const rod = document.createElement('div');
        rod.className = 'overlay-badge badge-rod';
        rod.innerText = '피뢰침';
        container.appendChild(rod);
    }
    if (pig.hasLock) {
        const lock = document.createElement('div');
        lock.className = 'overlay-badge badge-lock';
        lock.innerText = '잠금';
        container.appendChild(lock);
    }

    return container;
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

        // 1. 턴 표시
        const currentTurnPlayer = room.players[room.turn];
        const isMyTurn = currentTurnPlayer.id === myId;
        document.getElementById('turn-indicator').innerText = isMyTurn ? 
            '★ 내 차례입니다! ★' : `${room.turn + 1}번 플레이어 차례 대기 중...`;

        // 2. 상대방 돼지 렌더링
        const oppArea = document.getElementById('opponents-area');
        oppArea.innerHTML = '';
        room.players.forEach((player, idx) => {
            if (player.id !== myId) {
                const box = document.createElement('div');
                box.className = 'opponent-box' + (idx === room.turn ? ' active-turn' : '');
                box.innerHTML = `<h4>플레이어 (${idx + 1})</h4>`;
                
                const pigZone = document.createElement('div');
                pigZone.className = 'pig-zone';
                player.pigs.forEach((pig, pigIdx) => {
                    pigZone.appendChild(renderPigElement(pig, player.id, pigIdx));
                });
                box.appendChild(pigZone);
                oppArea.appendChild(box);
            }
        });

        // 3. 내 돼지 및 핸드 렌더링
        const me = room.players.find(p => p.id === myId);
        if (me) {
            const myPigZone = document.getElementById('my-pigs');
            myPigZone.innerHTML = '';
            me.pigs.forEach((pig, pigIdx) => {
                myPigZone.appendChild(renderPigElement(pig, me.id, pigIdx));
            });

            const myHandZone = document.getElementById('my-hand');
            myHandZone.innerHTML = '';
            me.hand.forEach((cardName, idx) => {
                const cardElem = document.createElement('div');
                cardElem.className = 'card card-' + cardName + (selectedCardIdx === idx ? ' selected' : '');
                cardElem.onclick = () => selectCard(idx, cardName);
                myHandZone.appendChild(cardElem);
            });
        }

        // 4. 중앙 필드 카드
        const centerDisplay = document.getElementById('played-card-display');
        if (room.centerCard) {
            if (room.centerCard === 'discard_all') {
                centerDisplay.className = 'card';
                centerDisplay.innerText = '카드 전부 버림';
            } else {
                centerDisplay.className = 'card card-' + room.centerCard;
                centerDisplay.innerText = '';
            }
            centerDisplay.style.opacity = '1';
        } else {
            centerDisplay.style.opacity = '0';
        }
    }
});

socket.on('errorMsg', (msg) => { alert(msg); });
socket.on('gameOver', (msg) => { alert(msg); location.reload(); });
