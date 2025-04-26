// Initialize SQLite database
let db;
let votingStarted = false;
let currentVoter = null;

// Initialize the database when the page loads
initDatabase();

async function initDatabase() {
    try {
        const initSqlJs = window.initSqlJs;
        const SQL = await initSqlJs({
            locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
        });

        db = new SQL.Database();

        db.run(`
            CREATE TABLE IF NOT EXISTS candidates (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                year INTEGER NOT NULL,
                semester INTEGER NOT NULL
            )
        `);

        db.run(`
            CREATE TABLE IF NOT EXISTS voters (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                year INTEGER NOT NULL,
                has_voted INTEGER DEFAULT 0
            )
        `);

        db.run(`
            CREATE TABLE IF NOT EXISTS votes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                candidate_id INTEGER NOT NULL,
                voter_id INTEGER NOT NULL,
                FOREIGN KEY (candidate_id) REFERENCES candidates (id),
                FOREIGN KEY (voter_id) REFERENCES voters (id)
            )
        `);

        console.log("Database initialized successfully");
        addSampleCandidates();

    } catch (error) {
        console.error("Error initializing database:", error);
        showModal("Error", "Failed to initialize the database. Please refresh the page.");
    }
}

function addSampleCandidates() {
    const sampleCandidates = [];

    sampleCandidates.forEach(candidate => {
        db.run(
            "INSERT INTO candidates (name, year, semester) VALUES (?, ?, ?)",
            [candidate.name, candidate.year, candidate.semester]
        );
    });

    updateCandidatesList();
}

function showPage(pageId) {
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    document.getElementById(pageId).classList.add('active');
}

function showModal(title, message, showConfirm = false, confirmCallback = null) {
    const modal = document.getElementById('modal');
    const modalTitle = document.getElementById('modal-title');
    const modalMessage = document.getElementById('modal-message');
    const modalConfirm = document.getElementById('modal-confirm');
    const modalCancel = document.getElementById('modal-cancel');

    modalTitle.textContent = title;
    modalMessage.textContent = message;

    if (showConfirm) {
        modalConfirm.style.display = 'block';
        modalCancel.style.display = 'block';

        modalConfirm.onclick = () => {
            if (confirmCallback) confirmCallback();
            closeModal();
        };
    } else {
        modalConfirm.style.display = 'none';
        modalCancel.style.display = 'none';
    }

    modal.classList.add('active');
}

function closeModal() {
    const modal = document.getElementById('modal');
    modal.classList.remove('active');
}

function registerCandidate() {
    const name = document.getElementById('candidate-name').value.trim();
    const year = parseInt(document.getElementById('candidate-year').value);
    const semester = parseInt(document.getElementById('candidate-semester').value);

    if (!name) {
        showModal("Error", "Please enter a candidate name.");
        return;
    }

    try {
        db.run(
            "INSERT INTO candidates (name, year, semester) VALUES (?, ?, ?)",
            [name, year, semester]
        );

        showModal("Success", "Candidate registered successfully!");
        document.getElementById('candidate-name').value = '';
        updateCandidatesList();
        showPage('dashboard-page');
    } catch (error) {
        console.error("Error registering candidate:", error);
        showModal("Error", "Failed to register candidate. Please try again.");
    }
}

function updateCandidatesList() {
    const candidatesGrid = document.querySelector('.candidates-grid');
    candidatesGrid.innerHTML = '';

    const candidates = db.exec("SELECT * FROM candidates ORDER BY name");

    if (candidates.length === 0 || candidates[0].values.length === 0) {
        candidatesGrid.innerHTML = '<p>No candidates registered yet.</p>';
        return;
    }

    candidates[0].values.forEach(candidate => {
        const [id, name, year, semester] = candidate;

        const candidateCard = document.createElement('div');
        candidateCard.className = 'candidate-card';
        candidateCard.innerHTML = `
            <h3>${name}</h3>
            <p>Year: ${year}</p>
            <p>Semester: ${semester}</p>
        `;

        candidatesGrid.appendChild(candidateCard);
    });
}

function startVoting() {
    if (getCandidatesCount() === 0) {
        showModal("Error", "No candidates registered. Please register candidates first.");
        return;
    }

    showModal("Confirm", "Are you sure you want to start the voting process?", true, () => {
        votingStarted = true;
        document.getElementById('start-voting-btn').disabled = true;
        document.getElementById('stop-voting-btn').disabled = false;
        showPage('voting-panel-page');
    });
}

function stopVoting() {
    showModal("Confirm", "Are you sure you want to stop the voting process? This cannot be undone.", true, () => {
        votingStarted = false;
        document.getElementById('stop-voting-btn').disabled = true;
        document.getElementById('results-btn').disabled = false;
        showPage('dashboard-page');
    });
}

function verifyVoter() {
    const name = document.getElementById('voter-name').value.trim();
    const year = parseInt(document.getElementById('voter-year').value);
    const pin = document.getElementById('voter-pin').value.trim();
    const storedPin = localStorage.getItem("invigilatorPin");

    if (!name) {
        showModal("Error", "Please enter your name.");
        return;
    }

    if (pin !== storedPin) {
        showModal("Error", "Invalid invigilator PIN.");
        return;
    }

    const voterResult = db.exec(
        "SELECT * FROM voters WHERE name = ? AND year = ? AND has_voted = 1",
        [name, year]
    );

    if (voterResult.length > 0 && voterResult[0].values.length > 0) {
        showModal("Error", "You have already voted in this election.");
        return;
    }

    let voterId;
    const existingVoter = db.exec(
        "SELECT id FROM voters WHERE name = ? AND year = ?",
        [name, year]
    );

    if (existingVoter.length > 0 && existingVoter[0].values.length > 0) {
        voterId = existingVoter[0].values[0][0];
    } else {
        db.run(
            "INSERT INTO voters (name, year) VALUES (?, ?)",
            [name, year]
        );
        const newVoter = db.exec("SELECT last_insert_rowid()");
        voterId = newVoter[0].values[0][0];
    }

    currentVoter = { id: voterId, name, year };

    document.getElementById('voter-registration').classList.add('hidden');
    document.getElementById('voting-area').classList.remove('hidden');

    loadCandidatesForVoting();
}

function loadCandidatesForVoting() {
    const votingCandidates = document.getElementById('voting-candidates');
    votingCandidates.innerHTML = '';

    const candidates = db.exec("SELECT * FROM candidates ORDER BY name");

    if (candidates.length === 0 || candidates[0].values.length === 0) {
        votingCandidates.innerHTML = '<p>No candidates available for voting.</p>';
        return;
    }

    candidates[0].values.forEach(candidate => {
        const [id, name, year, semester] = candidate;

        const candidateCard = document.createElement('div');
        candidateCard.className = 'voting-candidate-card';
        candidateCard.dataset.id = id;
        candidateCard.innerHTML = `
            <h3>${name}</h3>
            <p>Year: ${year}</p>
            <p>Semester: ${semester}</p>
        `;

        candidateCard.addEventListener('click', () => {
            showModal("Confirm Vote", `Are you sure you want to vote for ${name}?`, true, () => {
                castVote(id);
            });
        });

        votingCandidates.appendChild(candidateCard);
    });
}

function castVote(candidateId) {
    try {
        db.run(
            "INSERT INTO votes (candidate_id, voter_id) VALUES (?, ?)",
            [candidateId, currentVoter.id]
        );

        db.run(
            "UPDATE voters SET has_voted = 1 WHERE id = ?",
            [currentVoter.id]
        );

        showModal("Success", "Your vote has been recorded successfully! Next voter, please proceed.");

        document.getElementById('voter-name').value = '';
        document.getElementById('voter-year').value = '';
        document.getElementById('voter-pin').value = '';
        document.getElementById('voting-area').classList.add('hidden');
        document.getElementById('voter-registration').classList.remove('hidden');

        currentVoter = null;

        showPage('voting-panel-page');
    } catch (error) {
        console.error("Error casting vote:", error);
        showModal("Error", "Failed to cast vote. Please try again.");
    }
}

function showResults() {
    const results = calculateResults();
    displayTopCandidates(results);
    displayResultsTable(results);
    showPage('results-page');
}

function calculateResults() {
    const query = `
        SELECT c.id, c.name, c.year, c.semester, COUNT(v.id) as vote_count
        FROM candidates c
        LEFT JOIN votes v ON c.id = v.candidate_id
        GROUP BY c.id
        ORDER BY vote_count DESC
    `;

    const results = db.exec(query);

    if (results.length === 0) return [];

    return results[0].values.map(row => ({
        id: row[0],
        name: row[1],
        year: row[2],
        semester: row[3],
        votes: row[4]
    }));
}

function displayTopCandidates(results) {
    const podium = document.getElementById('winners-podium');
    podium.innerHTML = '';

    const topCandidates = results.slice(0, 3);

    const positions = [
        { class: 'second-place', index: 1 },
        { class: 'first-place', index: 0 },
        { class: 'third-place', index: 2 }
    ];

    positions.forEach(position => {
        const candidate = topCandidates[position.index];
        if (!candidate) return;

        const placeDiv = document.createElement('div');
        placeDiv.className = `podium-place ${position.class}`;

        placeDiv.innerHTML = `
            <div class="podium-block">${position.index + 1}</div>
            <div class="podium-info">
                <h3>${candidate.name}</h3>
                <p>Year: ${candidate.year}, Semester: ${candidate.semester}</p>
                <p class="podium-votes">${candidate.votes} votes</p>
            </div>
        `;

        podium.appendChild(placeDiv);
    });
}

function displayResultsTable(results) {
    const tableBody = document.querySelector('#results-table tbody');
    tableBody.innerHTML = '';

    results.forEach((candidate, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${candidate.name}</td>
            <td>${candidate.year}</td>
            <td>${candidate.semester}</td>
            <td>${candidate.votes}</td>
        `;

        tableBody.appendChild(row);
    });
}

function downloadResultsPDF() {
    const results = calculateResults();
    const tableData = results.map((candidate, index) => [
        index + 1,
        candidate.name,
        candidate.year,
        candidate.semester,
        candidate.votes
    ]);

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(18);
    doc.text("Election Results", 14, 22);

    doc.autoTable({
        startY: 30,
        head: [['Rank', 'Name', 'Year', 'Semester', 'Votes']],
        body: tableData
    });

    doc.save("election_results.pdf");
}

function getCandidatesCount() {
    const result = db.exec("SELECT COUNT(*) FROM candidates");
    return result[0].values[0][0];
}

// Check for PIN setup and initialize event listeners
document.addEventListener('DOMContentLoaded', () => {
    if (!localStorage.getItem("invigilatorPin")) {
        window.location.href = "set-pin.html";
        return;
    }

    document.getElementById('login-btn').addEventListener('click', () => {
        const pin = document.getElementById('pin').value;
        const storedPin = localStorage.getItem("invigilatorPin");

        if (pin === storedPin) {
            showPage('dashboard-page');
            updateCandidatesList();
        } else {
            showModal("Error", "Invalid PIN. Please try again.");
        }
    });

    document.getElementById('register-candidate-btn').addEventListener('click', () => {
        showPage('candidate-registration-page');
    });

    document.getElementById('start-voting-btn').addEventListener('click', startVoting);
    document.getElementById('stop-voting-btn').addEventListener('click', stopVoting);
    document.getElementById('results-btn').addEventListener('click', showResults);
    document.getElementById('logout-btn').addEventListener('click', () => {
        showPage('login-page');
        document.getElementById('pin').value = '';
    });

    document.getElementById('register-candidate-submit').addEventListener('click', registerCandidate);
    document.getElementById('back-to-dashboard').addEventListener('click', () => {
        showPage('dashboard-page');
    });

    document.getElementById('verify-voter').addEventListener('click', verifyVoter);
    document.getElementById('back-to-dashboard-from-voting').addEventListener('click', () => {
        showPage('dashboard-page');
    });

    document.getElementById('download-pdf').addEventListener('click', downloadResultsPDF);
    document.getElementById('back-to-dashboard-from-results').addEventListener('click', () => {
        showPage('dashboard-page');
    });

    document.querySelector('.close').addEventListener('click', closeModal);
    document.getElementById('modal-cancel').addEventListener('click', closeModal);
});
