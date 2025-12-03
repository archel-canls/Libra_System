console.log("bookmark.js loaded");

document.addEventListener("DOMContentLoaded", () => {
    const container = document.getElementById('book-list-container');
    const searchInput = document.getElementById('search-input');
    const searchBtn = document.getElementById('search-button');
    const totalLabel = document.getElementById('total-bookmarks');

    // Variabel untuk menyimpan data semua bookmark (agar pencarian cepat tanpa request ulang)
    let allBookmarks = [];

    // --- 1. Event Search ---
    searchBtn.addEventListener('click', () => filterBookmarks(searchInput.value));
    
    searchInput.addEventListener('keyup', (e) => {
        // Filter realtime saat mengetik atau saat tekan Enter
        filterBookmarks(searchInput.value);
    });

    // --- 2. Load Awal ---
    loadBookmarks();

    async function loadBookmarks() {
        container.innerHTML = '<p class="col-span-full text-center text-gray-500 mt-10"><i class="fas fa-spinner fa-spin"></i> Memuat daftar bookmark...</p>';

        try {
            const url = '/api/bookmarks';
            const res = await fetch(url, { credentials: 'include' });
            if(!res.ok) throw new Error('Gagal fetch data bookmark');

            allBookmarks = await res.json();
            
            // Render semua data awal
            renderBooks(allBookmarks);

        } catch(err) {
            console.error(err);
            container.innerHTML = '<p class="col-span-full text-center text-red-500">Gagal memuat bookmark.</p>';
        }
    }

    // --- 3. Fungsi Filter Client-Side ---
    function filterBookmarks(query) {
        const lowerQ = query.toLowerCase().trim();
        
        // Filter berdasarkan Judul Buku
        const filtered = allBookmarks.filter(b => 
            b.title.toLowerCase().includes(lowerQ)
        );

        renderBooks(filtered);
    }

    // --- 4. Render Card (Format Sama Persis dengan Dashboard) ---
    function renderBooks(books) {
        // Update counter
        if(totalLabel) totalLabel.textContent = `${books.length} Buku`;

        container.innerHTML = '';
        
        if(!books || books.length === 0) {
            container.innerHTML = `
                <div class="col-span-full text-center py-10">
                    <i class="fas fa-bookmark text-gray-300 text-5xl mb-3 block"></i>
                    <p class="text-gray-500">Tidak ada buku ditemukan di bookmark.</p>
                </div>`;
            return;
        }

        books.forEach(book => {
            // Setup Element Card
            const card = document.createElement('div');
            // Class CSS SAMA PERSIS dengan Dashboard Member
            card.className = 'bg-white p-4 rounded-lg shadow hover:shadow-lg transition flex flex-col cursor-pointer border border-gray-100 relative group';
            
            // Klik Card -> Buka Detail
            card.onclick = (e) => {
                // Jangan pindah halaman jika yang diklik adalah tombol hapus
                if(e.target.closest('.delete-bm-btn')) return;
                window.location.href = `/buka_buku_member.html?id=${book.id}`;
            };

            // Setup Gambar & Tombol Hapus Overlay
            let coverSrc = book.coverFile ? `/${book.coverFile}` : '/img/default_book.png';
            
            // HTML Image Wrapper
            const imageHTML = `
                <div class="relative w-full aspect-[2/3] mb-3">
                    <img src="${coverSrc}" alt="${book.title}" class="w-full h-full object-cover rounded shadow-sm">
                    
                    <button class="delete-bm-btn absolute top-2 right-2 w-8 h-8 flex items-center justify-center bg-white/90 rounded-full text-red-500 hover:bg-red-600 hover:text-white transition shadow-md z-10"
                            title="Hapus dari Bookmark"
                            data-id="${book.id}"
                            data-title="${book.title}">
                        <i class="fas fa-trash-alt text-sm"></i>
                    </button>
                </div>
            `;

            // Setup Genre Badges (Sama seperti member.js)
            let genreBadges = '';
            if (book.genre) {
                const genresList = book.genre.split(',').map(s => s.trim());
                genresList.forEach(g => {
                    // Render badge standar (abu-abu)
                    genreBadges += `<span class="text-[10px] px-2 py-1 rounded-md border bg-gray-50 text-gray-600 border-gray-100 mr-1 mb-1 inline-block">${g}</span>`;
                });
            }

            // Setup Status Stok
            const isAvailable = book.stock > 0;
            const statusClass = isAvailable ? 'text-green-600 font-medium' : 'text-red-500';
            const statusText = isAvailable ? 'Tersedia' : 'Habis';

            // Isi HTML Card
            card.innerHTML = `
                ${imageHTML}
                <div class="flex flex-wrap mb-2">${genreBadges}</div>
                <h3 class="font-bold text-lg mb-1 leading-tight line-clamp-2 text-gray-800" title="${book.title}">${book.title}</h3>
                <p class="text-sm text-gray-600 mb-2">${book.author} (${book.year})</p>
                <div class="mt-auto pt-2 border-t border-gray-100 flex justify-between items-center text-xs text-gray-500">
                    <span>${book.category || '-'}</span>
                    <span class="${statusClass}">
                        ${statusText}
                    </span>
                </div>
            `;

            // Event Listener Hapus
            const deleteBtn = card.querySelector('.delete-bm-btn');
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Stop event bubbling ke card
                handleDeleteBookmark(book.id, book.title, card);
            });

            container.appendChild(card);
        });
    }

    // --- 5. Fungsi API Hapus ---
    async function handleDeleteBookmark(bookId, title, cardElement) {
        if (!confirm(`Hapus buku "${title}" dari bookmark?`)) return;

        try {
            const res = await fetch("/bookmark", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ bookId: parseInt(bookId) }),
                credentials: "include"
            });
            
            const data = await res.json();
            
            if (data.success) {
                // Hapus dari array lokal
                allBookmarks = allBookmarks.filter(b => b.id !== bookId);

                // Animasi Hapus
                cardElement.style.transition = "all 0.3s ease";
                cardElement.style.opacity = "0";
                cardElement.style.transform = "scale(0.9)";
                
                setTimeout(() => {
                    // Render ulang agar layout grid rapi
                    renderBooks(allBookmarks);
                    
                    // Jika sedang dalam mode pencarian, render berdasarkan query
                    if(searchInput.value) {
                        filterBookmarks(searchInput.value);
                    }
                }, 300);
            } else {
                alert("Gagal menghapus: " + data.message);
            }
        } catch (err) {
            console.error(err);
            alert("Terjadi kesalahan koneksi.");
        }
    }
});