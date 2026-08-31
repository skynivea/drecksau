const socket = io();
let myRoomCode = '';
let myId = '';
let selectedCardIdx = null;

// 방 만들기 (클라이언트에서 4자리 대문자 코드 자동 생성 후 입장)
function createRoom() {
    const randomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
    document.getElementById('roomInput').value = randomCode;
    joinRoom();
}

// 방 참가하기
function joinRoom() {
    const rawInput = document.getElementById('roomInput').value;
    if (rawInput) {
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
    
    // 비 카드는 단독 즉시 발동
    if (cardName === 'rain') {
        socket.emit('playCard', { roomCode: myRoomCode, cardIdx: idx });
        selectedCardIdx = null;
        return;
    }

    const handCards = document.querySelectorAll('#my-hand .card');
    handCards.forEach((c, i) => {
        if (i === idx) c.classList.add('selected');
        else c.classList.remove('selected');
    });
}

function selectTargetPig(targetPlayerId, targetPigIdx) {
    if (selectedCardIdx === null) {
        alert('먼저 손에서 내실 카드를 클릭해 주세요!');
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

// 서버로부터 실시간 인원 및 상태 받아오기
socket.on('updateState', (room) => {
    myId = socket.id;
    document.getElementById('player-count').innerText = room.players.length;

    // ★ 방장(hostId)에게만 [게임 시작하기] 버튼 노출
    const startBtn = document.getElementById('start-btn');
    const hostNotice = document.getElementById('host-notice');

    if (room.hostId === myId) {
        startBtn.style.display = 'inline-block';
        hostNotice.innerText = '당신이 방장입니다. 인원이 모이면 시작 버튼을 누르세요.';
    } else {
        startBtn.style.display = 'none';
        hostNotice.innerText = '방장이 게임을 시작할 때까지 대기하세요.';
    }

    // 게임 진행 중일 경우
    if (room.isStarted) {
        document.getElementById('waiting-room').style.display = 'none';
        document.getElementById('game-board').style.display = 'flex';

        // 턴 가이드 표시
        const currentTurnPlayer = room.players[room.turn];
        const isMyTurn = currentTurnPlayer && currentTurnPlayer.id === myId;
        const turnIndicator = document.getElementById('turn-indicator');
        
        turnIndicator.innerText = isMyTurn ? 
            '★ 내 차례입니다! ★' : `${room.turn + 1}번 플레이어 차례 대기 중`;
        turnIndicator.style.background = isMyTurn ? '#e74c3c' : '#2196F3';

        // 상대방 돼지 렌더링
        const oppArea = document.getElementById('opponents-area');
        oppArea.innerHTML = '';
        room.players.forEach((player, idx) => {
            if (player.id !== myId) {
                const box = document.createElement('div');
                box.className = 'opponent-box' + (idx === room.turn ? ' active-turn' : '');
                box.innerHTML = `<h4>플레이어 ${idx + 1}</h4>`;
                
                const pigZone = document.createElement('div');
                pigZone.className = 'pig-zone';
                player.pigs.forEach((pig, pigIdx) => {
                    pigZone.appendChild(renderPigElement(pig, player.id, pigIdx));
                });
                box.appendChild(pigZone);
                oppArea.appendChild(box);
            }
        });

        // 내 돼지 및 손에 든 카드 렌더링
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

        // 중앙 내놓은 카드 렌더링
        const centerDisplay = document.getElementById('played-card-display');
        if (room.centerCard) {
            if (room.centerCard === 'discard_all') {
                centerDisplay.className = 'card card-back';
                centerDisplay.innerHTML = '<span>카드 버림</span>';
            } else {
                centerDisplay.className = 'card card-' + room.centerCard;
                centerDisplay.innerHTML = '';
            }
            centerDisplay.style.opacity = '1';
        } else {
            centerDisplay.style.opacity = '0';
        }
    }
});

socket.on('errorMsg', (msg) => { 
    alert(msg); 
    selectedCardIdx = null; 
    const handCards = document.querySelectorAll('#my-hand .card');
    handCards.forEach(c => c.classList.remove('selected'));
});

socket.on('gameOver', (msg) => { 
    alert(msg); 
    location.reload(); 
});
