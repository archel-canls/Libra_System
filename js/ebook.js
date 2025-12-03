document.addEventListener("DOMContentLoaded", () => {
    const ebookBtn = document.getElementById("tab-ebook");
    const historyBtn = document.getElementById("tab-history");
    const searchInput = document.getElementById("search-input");
    const searchBtn = document.getElementById("search-button");
    const bookContainer = document.getElementById('book-list-container');
    const historyContainer = document.getElementById("history-container");

    let activeTab = 'ebook';

    // ================= Load Books =================
    async function loadBooks(searchQuery = '', type = '', category = '') {
        console.log("loadBooks called with:", { searchQuery, type, category });
        bookContainer.innerHTML = '<p class="col-span-full text-center text-gray-500">Memuat daftar...</p>';

        let url = '/books';
        const params = new URLSearchParams();

        // Search teks
        if (searchQuery) {
            params.append('search', searchQuery);
        }

        // Filter kategori
        if (category) params.append('category', category);

        if ([...params].length > 0) url += '?' + params.toString();
        console.log("Fetch URL:", url);

        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error("HTTP error " + res.status);
            let books = await res.json();

            // Filter Ebook + Fisik & Ebook di frontend
            if (type === 'Ebook') {
                books = books.filter(book => book.type === 'Ebook' || book.type === 'Fisik & Ebook');
            }

            bookContainer.innerHTML = '';
            if (!books || books.length === 0) {
                bookContainer.innerHTML = '<p class="col-span-full text-center text-gray-500">Belum ada buku.</p>';
                return;
            }

            books.forEach(book => {
                const card = document.createElement('div');
                card.className = 'bg-white p-4 rounded-lg shadow max-w-xs mx-auto flex flex-col cursor-pointer hover:shadow-lg transition';

                card.addEventListener('click', () => {
                    window.location.href = `/buka_buku_member.html?id=${book.id}`;
                });

                const img = document.createElement('img');
                img.src = book.coverFile ? '/' + book.coverFile : '/uploads/default_book.png';
                img.alt = book.title;
                img.className = 'w-full aspect-[2/3] object-cover rounded mb-3';
                card.appendChild(img);

                const title = document.createElement('h3');
                title.textContent = book.title;
                title.className = 'font-bold text-lg mb-1 truncate';
                card.appendChild(title);

                const author = document.createElement('p');
                author.textContent = `${book.author} (${book.year})`;
                author.className = 'text-sm text-gray-600 mb-1';
                card.appendChild(author);

                const categoryEl = document.createElement('p');
                categoryEl.textContent = book.category;
                categoryEl.className = 'text-gray-700 text-sm line-clamp-3';
                card.appendChild(categoryEl);

                bookContainer.appendChild(card);
            });

        } catch (err) {
            console.error("Load books error:", err);
            bookContainer.innerHTML = '<p class="col-span-full text-center text-red-500">Gagal memuat buku.</p>';
        }
    }

    // ================= Load History Baca Ebook =================
async function loadHistory(searchQuery = '') {
    const historyContainer = document.getElementById("history-container");
    historyContainer.innerHTML = '<p class="text-center text-gray-500">Memuat riwayat baca ebook...</p>';
    
    try {
        // Fetch ke API Go yang baru
        const res = await fetch('/api/ebook/history');
        if (!res.ok) throw new Error("Gagal mengambil data");
        
        const history = await res.json();

        historyContainer.innerHTML = '';
        if(!history || history.length === 0){
            historyContainer.innerHTML = '<p class="text-center text-gray-500">Belum ada riwayat baca.</p>';
            return;
        }

        const filtered = history.filter(item =>
            item.title.toLowerCase().includes(searchQuery.toLowerCase())
        );

        if(filtered.length === 0){
            historyContainer.innerHTML = '<p class="text-center text-gray-500">Tidak ada buku yang cocok.</p>';
            return;
        }

        filtered.forEach(item => {
            const card = document.createElement("div");
            card.className = "bg-white p-4 rounded-lg shadow-md flex flex-row gap-4 items-start relative group";

            // Klik gambar/judul untuk lanjut baca (membuka halaman baca_buku)
            const openReader = () => {
                window.location.href = `/baca_buku?id=${item.bookId}`;
            };

            const img = document.createElement("img");
            img.src = item.coverFile ? "/" + item.coverFile : "/img/default_book.png";
            img.alt = item.title;
            img.className = "w-24 h-32 object-cover rounded flex-shrink-0 cursor-pointer hover:opacity-80";
            img.onclick = openReader;
            card.appendChild(img);

            const info = document.createElement("div");
            info.className = "flex flex-col gap-1 flex-1 cursor-pointer";
            info.onclick = openReader;

            const title = document.createElement("h3");
            title.textContent = item.title;
            title.className = "font-bold text-lg truncate hover:text-indigo-600";
            info.appendChild(title);

            const lastRead = document.createElement("p");
            lastRead.textContent = `Terakhir dibaca: ${item.dateLastRead}`;
            lastRead.className = "text-sm text-gray-600";
            info.appendChild(lastRead);

            const lastPage = document.createElement("p");
            lastPage.textContent = `Lanjut halaman: ${item.lastPage}`;
            lastPage.className = "text-sm font-semibold text-indigo-600";
            info.appendChild(lastPage);

            card.appendChild(info);

            // === TOMBOL HAPUS SATUAN ===
            const deleteBtn = document.createElement("button");
            deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
            deleteBtn.className = "absolute top-2 right-2 text-gray-400 hover:text-red-500 p-2 transition";
            deleteBtn.title = "Hapus Riwayat Ini";
            deleteBtn.onclick = async (e) => {
                e.stopPropagation(); // Mencegah trigger openReader
                if(!confirm(`Hapus riwayat baca "${item.title}"?`)) return;
                
                try {
                    const delRes = await fetch(`/api/ebook/history?id=${item.id}`, { method: 'DELETE' });
                    const delData = await delRes.json();
                    if(delData.success) {
                        card.remove(); // Hapus elemen dari DOM
                        if(historyContainer.children.length === 0) {
                             historyContainer.innerHTML = '<p class="text-center text-gray-500">Belum ada riwayat baca.</p>';
                        }
                    } else {
                        alert("Gagal menghapus: " + delData.message);
                    }
                } catch(err) {
                    console.error(err);
                    alert("Terjadi kesalahan koneksi.");
                }
            };
            card.appendChild(deleteBtn);

            historyContainer.appendChild(card);
        });

    } catch (err) {
        console.error(err);
        historyContainer.innerHTML = '<p class="text-center text-red-500">Gagal memuat riwayat baca.</p>';
    }
}

    // ================= Tab Handling =================
    function resetTabs() {
        ebookBtn.classList.remove("border-indigo-600", "text-indigo-600");
        historyBtn.classList.remove("border-indigo-600", "text-indigo-600");
        bookContainer.classList.add("hidden");
        historyContainer.classList.add("hidden");
    }

    const filterOptions = document.getElementById("ebook-filter-options");

    function activateTab(tab) {
        resetTabs();

        if(tab === 'ebook') {
            activeTab = 'ebook';
            ebookBtn.classList.add("border-indigo-600","text-indigo-600");
            searchInput.placeholder = "Masukan Judul Buku atau Genre...";
            bookContainer.classList.remove("hidden");
            if(filterOptions) filterOptions.classList.add("hidden");

            // 🔥 Load semua Ebook termasuk Fisik & Ebook
            loadBooks(searchInput.value.trim(), 'Ebook');

        } else if(tab === 'history') {
            activeTab = 'history';
            historyBtn.classList.add("border-indigo-600","text-indigo-600");
            searchInput.placeholder = "Cari Berdasarkan ID Transaksi...";
            historyContainer.classList.remove("hidden");
            if(filterOptions) filterOptions.classList.remove("hidden");

            historyContainer.classList.add("opacity-0");
            loadHistory(searchInput.value.trim());
            setTimeout(() => {
                if(typeof applyStatusFilter === "function") applyStatusFilter();
                historyContainer.classList.remove("opacity-0");
            }, 150);
        }
    }

    // ================= Search =================
    function performSearch() {
        if(activeTab === 'ebook') loadBooks(searchInput.value.trim(), 'Ebook');
        else if(activeTab === 'history') loadHistory(searchInput.value.trim());
    }

    ebookBtn.addEventListener('click', () => activateTab('ebook'));
    historyBtn.addEventListener('click', () => activateTab('history'));
    searchBtn.addEventListener('click', performSearch);
    searchInput.addEventListener('keyup', e => { if(e.key === 'Enter') performSearch(); });

    // Load awal
    activateTab('ebook');
});
