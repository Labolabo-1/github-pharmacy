// ==================== CONFIG ====================
const SUPABASE_URL = "https://pgqjpbccjstnkzfnkbiv.supabase.co";
const SUPABASE_KEY = "sb_publishable_5EkQuo__f-rleuSd2kFkNw_tS54Qo7W";
const EMAIL_DOMAIN = "pharmacy.local"; // Appended to username

// ==================== INIT ====================
const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null;
let allMedications = [];
let currentMedId = null;
let editingMedId = null;

document.addEventListener("DOMContentLoaded", () => {
  checkSession();
  setupListeners();
});

// ==================== AUTH ====================
async function checkSession() {
  const {
    data: { session },
  } = await supabaseClient.auth.getSession();
  if (session) {
    currentUser = session.user;
    showDashboard();
    loadMedications();
  } else {
    showLogin();
  }
}

async function login(username, password) {
  const email = `${username}@${EMAIL_DOMAIN}`;
  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    document.getElementById("loginError").textContent = error.message;
    return;
  }

  currentUser = data.user;
  showDashboard();
  loadMedications();
}

async function logout() {
  await supabaseClient.auth.signOut();
  currentUser = null;
  showLogin();
}

// ==================== VIEWS ====================
function showLogin() {
  document.getElementById("login-view").style.display = "flex";
  document.getElementById("dashboard-view").style.display = "none";
  document.getElementById("username").value = "";
  document.getElementById("password").value = "";
  document.getElementById("loginError").textContent = "";
}

function showDashboard() {
  document.getElementById("login-view").style.display = "none";
  document.getElementById("dashboard-view").style.display = "block";
  document.getElementById("userInfo").textContent =
    currentUser.email.split("@")[0];
}

// ==================== EVENT LISTENERS ====================
function setupListeners() {
  // Login
  document.getElementById("loginForm").addEventListener("submit", (e) => {
    e.preventDefault();
    login(
      document.getElementById("username").value.trim(),
      document.getElementById("password").value,
    );
  });

  // Search
  document.getElementById("searchInput").addEventListener("input", (e) => {
    renderTable(e.target.value);
  });

  // Filters
  document.getElementById("filterExpiring").addEventListener("click", () => {
    document.getElementById("filterExpiring").classList.add("active");
    document.getElementById("showAll").classList.remove("active");
    renderTable("", true);
  });

  document.getElementById("showAll").addEventListener("click", () => {
    document.getElementById("showAll").classList.add("active");
    document.getElementById("filterExpiring").classList.remove("active");
    renderTable("");
  });

  // Close modals on outside click
  window.onclick = (e) => {
    if (e.target.classList.contains("modal")) {
      e.target.style.display = "none";
    }
  };
}

// ==================== DATA ====================
async function loadMedications() {
  const { data, error } = await supabaseClient
    .from("medications")
    .select("*")
    .order("name");

  if (error) {
    console.error("Load error:", error);
    return;
  }

  allMedications = data;
  renderTable();
}

function getStatusColor(expDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(expDate);
  const daysDiff = Math.ceil((exp - today) / (1000 * 60 * 60 * 24));

  if (daysDiff < 0) return { class: "expired", label: "Expired" };
  if (daysDiff <= 30) return { class: "urgent", label: "Urgent" };
  if (daysDiff <= 90) return { class: "warning", label: "Warning" };
  return { class: "safe", label: "Safe" };
}

function renderTable(search = "", filterExpiring = false) {
  const tbody = document.querySelector("#inventoryTable tbody");
  tbody.innerHTML = "";

  let meds = allMedications;

  if (search) {
    const s = search.toLowerCase();
    meds = meds.filter((m) => m.name.toLowerCase().includes(s));
  }

  if (filterExpiring) {
    const today = new Date();
    const thirtyDays = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
    meds = meds.filter((m) => new Date(m.expiration_date) <= thirtyDays);
  }

  meds.forEach((med) => {
    const status = getStatusColor(med.expiration_date);
    const row = document.createElement("tr");
    row.className = status.class;
    row.innerHTML = `
            <td>${med.name}</td>
            <td>${med.quantity}</td>
            <td>${med.expiration_date}</td>
            <td><span class="status-badge ${status.class}">${status.label}</span></td>
            <td>
                <button onclick="openTransactionModal(${med.id}, ${med.quantity}, '${med.name.replace(/'/g, "\\'")}')">+/-</button>
                <button onclick="openEditModal(${med.id}, '${med.name.replace(/'/g, "\\'")}', '${med.expiration_date}')">✎</button>
                <button onclick="deleteMed(${med.id})" class="danger">🗑</button>
            </td>
        `;
    tbody.appendChild(row);
  });
}

// ==================== TRANSACTIONS ====================
function openTransactionModal(id, qty, name) {
  currentMedId = id;
  document.getElementById("modalTitle").textContent = name;
  document.getElementById("currentQty").textContent = qty;
  document.getElementById("amount").value = "";
  document.getElementById("note").value = "";
  document.querySelector('input[name="action"][value="add"]').checked = true;
  document.getElementById("transactionModal").style.display = "flex";
}

function closeModal() {
  document.getElementById("transactionModal").style.display = "none";
  currentMedId = null;
}

async function submitTransaction() {
  const action = document.querySelector('input[name="action"]:checked').value;
  const amount = parseInt(document.getElementById("amount").value);
  const note = document.getElementById("note").value;

  if (!amount || amount < 1) {
    alert("Please enter a valid amount");
    return;
  }

  const change = action === "add" ? amount : -amount;

  const { error } = await supabaseClient.rpc("log_transaction", {
    med_id: currentMedId,
    user_uuid: currentUser.id,
    change: change,
    note_text: note || null,
  });

  if (error) {
    alert("Transaction failed: " + error.message);
    return;
  }

  closeModal();
  loadMedications();
}

// ==================== ADD MEDICATION ====================
function openAddModal() {
  document.getElementById("addMedModal").style.display = "flex";
}

function closeAddModal() {
  document.getElementById("addMedModal").style.display = "none";
}

async function submitNewMed() {
  const name = document.getElementById("newName").value.trim();
  const qty = parseInt(document.getElementById("newQty").value);
  const expiry = document.getElementById("newExpiry").value;

  if (!name || isNaN(qty) || !expiry) {
    alert("Please fill all fields");
    return;
  }

  const { error } = await supabaseClient
    .from("medications")
    .insert([{ name, quantity: qty, expiration_date: expiry }]);

  if (error) {
    alert("Failed to add: " + error.message);
    return;
  }

  document.getElementById("newName").value = "";
  document.getElementById("newQty").value = "";
  document.getElementById("newExpiry").value = "";
  closeAddModal();
  loadMedications();
}

// ==================== EDIT MEDICATION ====================
function openEditModal(id, name, expiry) {
  editingMedId = id;
  document.getElementById("editName").value = name;
  document.getElementById("editExpiry").value = expiry;
  document.getElementById("editMedModal").style.display = "flex";
}

function closeEditModal() {
  document.getElementById("editMedModal").style.display = "none";
  editingMedId = null;
}

async function submitEdit() {
  const name = document.getElementById("editName").value.trim();
  const expiry = document.getElementById("editExpiry").value;

  if (!name || !expiry) {
    alert("Please fill all fields");
    return;
  }

  const { error } = await supabaseClient
    .from("medications")
    .update({ name, expiration_date: expiry })
    .eq("id", editingMedId);

  if (error) {
    alert("Failed to update: " + error.message);
    return;
  }

  closeEditModal();
  loadMedications();
}

// ==================== DELETE ====================
async function deleteMed(id) {
  if (!confirm("Delete this medication?")) return;

  const { error } = await supabaseClient
    .from("medications")
    .delete()
    .eq("id", id);

  if (error) {
    alert("Failed to delete: " + error.message);
    return;
  }

  loadMedications();
}
