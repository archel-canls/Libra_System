console.log("manajemen_anggota.js loaded");

document.addEventListener("DOMContentLoaded", () => {
    const container = document.getElementById('member-list-container');
    const searchInput = document.getElementById('search-input');
    const searchBtn = document.getElementById('search-button');

    async function loadMembers(search = '') { // tambahkan parameter search
        container.innerHTML = '<p class="text-center text-gray-500">Memuat daftar anggota...</p>';

        try {
            let url = '/api/members';
            if (search) {
                url += '?search=' + encodeURIComponent(search); // tambahkan query search jika ada
            }

            const res = await fetch(url);
            const members = await res.json();

            container.innerHTML = '';
            if (!members || members.length === 0) {
                container.innerHTML = '<p class="text-center text-gray-500">Belum ada anggota.</p>';
                return;
            }

            members.forEach(m => {
                const card = document.createElement('div');
                card.className = 'bg-white p-4 rounded-xl shadow flex flex-row items-center justify-between w-full';

                const left = document.createElement('div');
                left.className = 'flex items-center space-x-4';
                left.innerHTML = `
                    <img src="${m.ProfilePicture || '/img/default_user.png'}" class="w-16 h-16 rounded-full object-cover border-2 border-indigo-500">
                    <div>
                        <h3 class="font-semibold text-lg">${m.Fullname}</h3>
                        <p class="text-gray-600 text-sm">${m.Role}</p>
                        <p class="text-gray-600 text-sm">${m.Email}</p>
                    </div>
                `;

                const right = document.createElement('div');
                right.className = 'flex space-x-2';

                const editBtn = document.createElement('button');
                editBtn.textContent = 'Edit Role';
                editBtn.className = 'px-3 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600';
                editBtn.onclick = () => {
                    const newRole = prompt(`Ubah role untuk ${m.Username}`, m.Role);
                    if (newRole) updateRole(m.ID, newRole);
                };

                const deleteBtn = document.createElement('button');
                deleteBtn.textContent = 'Hapus Akun';
                deleteBtn.className = 'px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600';
                deleteBtn.onclick = () => {
                    if (confirm(`Hapus akun ${m.Username}?`)) deleteUser(m.ID);
                };

                right.appendChild(editBtn);
                right.appendChild(deleteBtn);

                card.appendChild(left);
                card.appendChild(right);

                container.appendChild(card);
            });

        } catch (err) {
            console.error("Load members error:", err);
            container.innerHTML = '<p class="text-center text-red-500">Gagal memuat anggota.</p>';
        }
    }

    async function updateRole(userId, role) {
        try {
            const res = await fetch(`/api/members/${userId}/role`, {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({role})
            });
            if (res.ok) {
                alert('Role berhasil diubah');
                loadMembers();
            } else {
                alert('Gagal mengubah role');
            }
        } catch (err) {
            console.error(err);
            alert('Terjadi error');
        }
    }

    async function deleteUser(userId) {
        try {
            const res = await fetch(`/api/members/${userId}`, {method: 'DELETE'});
            if (res.ok) {
                alert('Akun berhasil dihapus');
                loadMembers();
            } else {
                alert('Gagal menghapus akun');
            }
        } catch (err) {
            console.error(err);
            alert('Terjadi error');
        }
    }

    // --- Tambahkan listener search ---  
    if (searchBtn && searchInput) {
        searchBtn.addEventListener('click', () => {
            const query = searchInput.value.trim();
            loadMembers(query);
        });

        searchInput.addEventListener('keyup', e => {
            if (e.key === 'Enter') {
                const query = searchInput.value.trim();
                loadMembers(query);
            }
        });
    }

    loadMembers(); // load anggota awal
});
