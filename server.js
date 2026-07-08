const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { ZipArchive } = require('archiver');

const app = express();
const PORT = process.env.PORT || 3000;

// ----------------------------------------------------
// 🔹 데이터베이스 및 영상 저장소 경로 설정
// ----------------------------------------------------
const BASE_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || __dirname;

const dbFilePath = path.join(BASE_DIR, 'database.json');
const videoDir = path.join(BASE_DIR, 'videos');

// 🔹 등락 포함 '팀 랭킹 결과'를 통째로 저장해 두는 파일
const teamRankingFilePath = path.join(BASE_DIR, 'team_ranking.json');

app.use('/videos', express.static(videoDir));

if (!fs.existsSync(dbFilePath)) {
    fs.writeFileSync(dbFilePath, JSON.stringify([]));
}

app.use(express.json());
app.use(cors());
app.use(express.static('public'));

const mockDatabase = ["버추얼 길", "장연우", "홈런왕", "에이스"];

// ----------------------------------------------------
// 🔹 영상 저장을 위한 multer 세팅
// ----------------------------------------------------
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const dir = videoDir;
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: function (req, file, cb) {
        cb(null, 'cheer_' + Date.now() + '.mp4');
    }
});

const upload = multer({ storage: storage });

// ----------------------------------------------------
// 🔹 팀 랭킹 계산 헬퍼
// ----------------------------------------------------
const normalizeTeam = (team) => {
    if (!team) return '기타';
    if (team.includes('Penguins')) return 'Symphony Penguins';
    if (team.includes('Bees'))     return 'Angry Bees';
    if (team.includes('Wolves'))   return 'Silent Wolves';
    return '기타';
};

const computeTeamRanking = (db) => {
    const teamTotals = {};
    db.forEach((match) => {
        const teamKey = normalizeTeam(match.team);
        if (teamKey === '기타') return;

        const score = match.totalScore || 0;
        if (!teamTotals[teamKey]) {
            teamTotals[teamKey] = { score: 0, playCount: 0 };
        }
        teamTotals[teamKey].score += score;
        teamTotals[teamKey].playCount += 1;
    });

    const teamRanking = Object.keys(teamTotals).map((teamKey) => ({
        squadName: teamKey,
        team: teamKey,
        totalScore: teamTotals[teamKey].score,
        playCount: teamTotals[teamKey].playCount
    }));

    teamRanking.sort((a, b) => b.totalScore - a.totalScore);
    teamRanking.forEach((team, index) => {
        team.rank = index + 1;
    });

    return teamRanking;
};

const toRankMap = (ranking) => {
    const map = {};
    ranking.forEach((t) => { map[t.team] = t.rank; });
    return map;
};

// ----------------------------------------------------
// 🔹 API 라우터 모음
// ----------------------------------------------------

// 1. 닉네임 중복 확인
app.get('/api/check-nickname', (req, res) => {
    const nickname = req.query.nickname;
    if (!nickname) {
        return res.status(400).json({ error: '닉네임이 전달되지 않았습니다.' });
    }

    const rawData = fs.readFileSync(dbFilePath);
    const db = JSON.parse(rawData);
    const searchTarget = nickname.replace(/\s+/g, '').toLowerCase();
    const norm = (s) => (s || '').replace(/\s+/g, '').toLowerCase();

    const inDb = db.some((match) => norm(match.squadName) === searchTarget);
    const inMock = mockDatabase.some((name) => norm(name) === searchTarget);

    res.json({ isDuplicate: inDb || inMock });
});

// 2. 영상 업로드
app.post('/api/upload_video', upload.single('video'), (req, res) => {
    if (!req.file) {
        return res.status(400).send("영상 파일이 없습니다.");
    }

    const matchId = req.body.matchId;
    const oldPath = req.file.path;
    const newPath = path.join(videoDir, `${matchId}.mp4`);

    fs.renameSync(oldPath, newPath);
    console.log(`[서버] 🎥 인생네컷 영상 저장 완료! 일련번호: ${matchId}`);

    res.status(200).json({
        message: "영상 업로드 성공",
        videoUrl: `/videos/${matchId}.mp4`
    });
});

// 3. 게임 결과 기록 (+ 팀 등락 계산해서 저장)
app.post('/api/save_match', (req, res) => {
    const matchData = req.body;
    matchData.timestamp = new Date().toLocaleString();

    const rawData = fs.readFileSync(dbFilePath);
    const db = JSON.parse(rawData);

    const prevRankMap = toRankMap(computeTeamRanking(db));

    db.push(matchData);
    fs.writeFileSync(dbFilePath, JSON.stringify(db, null, 2));

    const newRanking = computeTeamRanking(db);
    newRanking.forEach((t) => {
        const prev = prevRankMap[t.team];
        t.rankChange = (typeof prev === 'number') ? (prev - t.rank) : 0;
    });

    try {
        fs.writeFileSync(teamRankingFilePath, JSON.stringify(newRanking, null, 2));
    } catch (e) {
        console.warn('[서버] 팀 랭킹(등락) 저장 실패:', e.message);
    }

    console.log(`[서버] ${matchData.squadName} 응원단의 기록이 저장되었습니다!`);
    res.status(200).json({ message: "성공적으로 저장되었습니다." });
});

// 4. 저장된 데이터 가져오기
app.get('/api/get_matches', (req, res) => {
    const rawData = fs.readFileSync(dbFilePath);
    res.json(JSON.parse(rawData));
});

// 5. 개인 랭킹
app.get('/api/get_ranking', (req, res) => {
    const rawData = fs.readFileSync(dbFilePath);
    let db = JSON.parse(rawData);
    db.sort((a, b) => b.totalScore - a.totalScore);
    res.json(db);
});

app.get('/api/get_individual_ranking', (req, res) => {
    const rawData = fs.readFileSync(dbFilePath);
    let db = JSON.parse(rawData);
    db.sort((a, b) => b.totalScore - a.totalScore);
    res.json(db);
});

// 5-2. 팀 랭킹
app.get('/api/get_team_ranking', (req, res) => {
    try {
        if (fs.existsSync(teamRankingFilePath)) {
            const stored = JSON.parse(fs.readFileSync(teamRankingFilePath));
            return res.json(stored);
        }
    } catch (e) {
        console.warn('[서버] 저장된 팀 랭킹 읽기 실패, 즉석 계산으로 대체:', e.message);
    }

    const db = JSON.parse(fs.readFileSync(dbFilePath));
    const ranking = computeTeamRanking(db);
    ranking.forEach((t) => { t.rankChange = 0; });
    res.json(ranking);
});

// ----------------------------------------------------
// 🔹 6. 모든 영상 일괄 다운로드
// ----------------------------------------------------
app.get('/api/videos/download-all', (req, res) => {
    // 저장소가 존재하는지 확인
    if (!fs.existsSync(videoDir)) {
        return res.status(404).send('영상 폴더를 찾을 수 없거나 아직 영상이 없습니다.');
    }
    
    // 브라우저 다운로드 설정
    res.attachment('symphony_videos.zip');
    
    // 압축 객체 생성 (최고 압축)
    const archive = new ZipArchive({
        zlib: { level: 9 } 
    });
    
    archive.on('error', (err) => {
        res.status(500).send({ error: err.message });
    });
    
    archive.pipe(res);
    archive.directory(videoDir, false);
    archive.finalize();
});

// ----------------------------------------------------
// 🔹 7. 영상 타임스탬프 목록 CSV 다운로드 (데이터베이스 기준)
// ----------------------------------------------------
app.get('/api/videos/timestamps', (req, res) => {
    // 데이터베이스 파일이 존재하는지 확인
    if (!fs.existsSync(dbFilePath)) {
        return res.status(404).send('기록된 데이터가 없습니다.');
    }

    try {
        const rawData = fs.readFileSync(dbFilePath);
        const db = JSON.parse(rawData);

        // CSV 헤더 작성 (엑셀에서 한글이 깨지지 않도록 UTF-8 BOM \uFEFF 추가)
        let csvContent = '\uFEFF영상 파일명,응원단 닉네임,선택 팀,녹화 시간\n';

        // 저장된 매치 데이터를 돌면서 한 줄씩 CSV 형식으로 변환
        db.forEach((match) => {
            const fileName = match.matchId ? `${match.matchId}.mp4` : '파일 없음';
            const squadName = match.squadName || '';
            const team = match.team || '';
            const timestamp = match.timestamp || '';

            // 데이터에 콤마가 있어도 셀이 깨지지 않도록 큰따옴표로 감싸기
            csvContent += `"${fileName}","${squadName}","${team}","${timestamp}"\n`;
        });

        // 브라우저에게 CSV 파일 다운로드임을 알림
        res.attachment('symphony_video_timestamps.csv');
        res.set('Content-Type', 'text/csv; charset=utf-8');
        res.status(200).send(csvContent);

    } catch (e) {
        console.error('[서버] 타임스탬프 추출 실패:', e.message);
        res.status(500).send({ error: '문서 생성 중 오류가 발생했습니다.' });
    }
});

// ----------------------------------------------------
// 🔹 8. 서버 파일 시스템 기준 영상 메타데이터 CSV 다운로드 (새로 추가)
// ----------------------------------------------------
app.get('/api/videos/file-timestamps', (req, res) => {
    // 영상 폴더가 있는지 확인
    if (!fs.existsSync(videoDir)) {
        return res.status(404).send('영상 폴더를 찾을 수 없습니다.');
    }

    try {
        // 폴더 안의 모든 파일 목록 읽어오기
        const files = fs.readdirSync(videoDir);
        
        // CSV 헤더 작성 (한글 깨짐 방지용 BOM 포함)
        let csvContent = '\uFEFF파일명,파일 크기(MB),Railway 저장 시간\n';

        files.forEach(file => {
            // .mp4 파일만 골라내기
            if(file.endsWith('.mp4')) {
                const filePath = path.join(videoDir, file);
                
                // 파일의 상세 정보(메타데이터) 가져오기
                const stats = fs.statSync(filePath);
                
                // 파일 크기를 MB 단위로 변환 (소수점 1자리까지)
                const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(1);
                
                // 파일 수정 시간(mtime)을 한국 시간 기준으로 변환
                const fileTime = new Date(stats.mtime).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });

                // CSV 한 줄씩 추가
                csvContent += `"${file}","${fileSizeMB}MB","${fileTime}"\n`;
            }
        });

        // 브라우저 다운로드 설정
        res.attachment('railway_file_system_times.csv');
        res.set('Content-Type', 'text/csv; charset=utf-8');
        res.status(200).send(csvContent);

    } catch (e) {
        console.error('[서버] 파일 시스템 시간 추출 실패:', e.message);
        res.status(500).send({ error: '문서 생성 중 오류가 발생했습니다.' });
    }
});

// 서버 실행
app.listen(PORT, () => {
    console.log(`🚀 서버 구동 완료! http://localhost:${PORT} 로 접속해보세요.`);
});