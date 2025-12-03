console.log("Admin.js loaded with Advanced Filtering");

// --- Global State untuk Filter (Sama seperti Member) ---
let currentFilters = {
    search: '',
    type: '',
    category: '',
    genre: [] // Array untuk multi-genre
};

async function checkLogin() {
    try {
        const res = await fetch('/api/check-session');
        const data = await res.json();
        if (!data.loggedIn) {
            window.location.href = '/login';
        }
    } catch(err) {
        window.location.href = '/login';
    }
}

document.addEventListener("DOMContentLoaded", () => {
    console.log("DOM fully loaded");

    const container = document.getElementById('book-list-container');
    const searchInput = document.getElementById('search-input');
    const searchBtn = document.getElementById('search-button');
    const addBookForm = document.getElementById("add-book-form");

    // --- Element Filter UI ---
    const filterBtn = document.getElementById('filter-button');
    const filterDropdown = document.getElementById('filter-dropdown');
    const currentFilterText = document.getElementById('current-filter-text');
    
    const jenisBukuOptions = document.getElementById('jenis-buku-options');
    const kategoriBukuOptions = document.getElementById('kategori-buku-options');
    const genreBukuOptions = document.getElementById('genre-buku-options');

    // --- Custom Genre Input ---
    const customGenreInput = document.getElementById('custom-genre-input');
    const addGenreBtn = document.getElementById('add-genre-btn');

    // ==========================================
    // 1. LOGIKA ADMIN KHUSUS (Tambah Buku)
    // ==========================================
    const addBar = document.getElementById('add-book-bar-container');
    const toggleAddBtn = document.getElementById('toggle-add-bar-btn');
    const cancelAddBtn = document.getElementById('cancel-add-btn');

    if(toggleAddBtn && addBar) {
        toggleAddBtn.addEventListener('click', () => {
            addBar.classList.toggle('show');
            // Scroll ke form jika dibuka
            if(addBar.classList.contains('show')) {
                addBar.scrollIntoView({ behavior: 'smooth' });
            }
        });
    }

    if(cancelAddBtn && addBar) {
        cancelAddBtn.addEventListener('click', () => {
            addBar.classList.remove('show');
        });
    }

    if(addBookForm) {
        addBookForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const formData = new FormData(addBookForm);
            try {
                const res = await fetch("/add-book", { method: "POST", body: formData });
                if(!res.ok) throw new Error("HTTP error " + res.status);
                const data = await res.json();

                if(data.success) {
                    alert("Buku berhasil ditambahkan!");
                    addBookForm.reset();
                    document.getElementById('add-book-bar-container').classList.remove('show');
                    loadBooks(); // Refresh list dengan filter saat ini
                } else {
                    alert("Gagal menambahkan buku: " + (data.message || "Unknown error"));
                }
            } catch(err) {
                console.error("Submit add book error:", err);
                alert("Terjadi kesalahan saat menambahkan buku.");
            }
        });
    }

    // ==========================================
    // 2. LOGIKA FILTER (Copy dari Member.js)
    // ==========================================

    // Toggle Dropdown
    if (filterBtn && filterDropdown) {
        filterBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            filterDropdown.classList.toggle('show');
        });

        // Klik di luar dropdown menutup dropdown
        document.addEventListener('click', (e) => {
            if (!filterBtn.contains(e.target) && !filterDropdown.contains(e.target)) {
                filterDropdown.classList.remove('show');
            }
        });
    }

    // Helper: Sembunyikan semua opsi sub-menu
    function hideAllFilterOptions() {
        if (jenisBukuOptions) jenisBukuOptions.classList.add("hidden");
        if (kategoriBukuOptions) kategoriBukuOptions.classList.add("hidden");
        if (genreBukuOptions) genreBukuOptions.classList.add("hidden");
    }

    // Helper: Update Text Label Tombol Filter
    function updateFilterLabel(text) {
        if (currentFilterText) currentFilterText.textContent = text;
    }

    // Helper: Reset tampilan tag genre
    function resetGenreUI() {
        if (!genreBukuOptions) return;
        // Reset tombol default
        genreBukuOptions.querySelectorAll('.genre-btn').forEach(b => {
            // Abaikan tombol custom tags (yang ada tanda 'x')
            if(!b.classList.contains('custom-genre-tag')) {
                b.classList.remove('bg-purple-600', 'text-white', 'border-transparent');
                b.classList.add('bg-purple-100', 'text-purple-700', 'border-purple-300');
            }
        });
        // Hapus custom tags
        document.querySelectorAll('.custom-genre-tag').forEach(el => el.remove());
    }

    // Handler Klik Item Dropdown
    if (filterDropdown) {
        filterDropdown.querySelectorAll('a').forEach(a => {
            a.addEventListener('click', (e) => {
                e.preventDefault();
                const filterType = a.dataset.filter;
                
                filterDropdown.classList.remove('show');
                hideAllFilterOptions();

                if (filterType === "all") {
                    updateFilterLabel("Semua");
                    // Reset State
                    currentFilters.type = '';
                    currentFilters.category = '';
                    currentFilters.genre = [];
                    
                    // Reset UI
                    if(jenisBukuOptions) jenisBukuOptions.querySelectorAll('.jenis-btn').forEach(b => b.classList.remove('active'));
                    if(kategoriBukuOptions) kategoriBukuOptions.querySelectorAll('.kategori-btn').forEach(b => b.classList.remove('active'));
                    resetGenreUI();
                    
                    loadBooks();
                } 
                else if (filterType === "jenis_buku") {
                    updateFilterLabel("Jenis Buku");
                    if (jenisBukuOptions) jenisBukuOptions.classList.remove("hidden");
                } 
                else if (filterType === "kategori") {
                    updateFilterLabel("Kategori");
                    if (kategoriBukuOptions) kategoriBukuOptions.classList.remove("hidden");
                } 
                else if (filterType === "genre") {
                    updateFilterLabel("Genre");
                    if (genreBukuOptions) genreBukuOptions.classList.remove("hidden");
                }
            });
        });
    }

    // --- Handler: Jenis Buku (Single Select) ---
    if (jenisBukuOptions) {
        jenisBukuOptions.querySelectorAll('.jenis-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const val = btn.dataset.type;
                // Toggle logic
                if (currentFilters.type === val) {
                    currentFilters.type = '';
                    btn.classList.remove('active');
                    // Style reset manual
                    btn.classList.remove('bg-indigo-600', 'text-white');
                    btn.classList.add('bg-white', 'text-gray-700');
                } else {
                    // Reset sibling buttons
                    jenisBukuOptions.querySelectorAll('.jenis-btn').forEach(b => {
                        b.classList.remove('active', 'bg-indigo-600', 'text-white');
                        b.classList.add('bg-white', 'text-gray-700');
                    });
                    currentFilters.type = val;
                    btn.classList.add('active', 'bg-indigo-600', 'text-white');
                    btn.classList.remove('bg-white', 'text-gray-700');
                }
                loadBooks();
            });
        });
    }

    // --- Handler: Kategori (Single Select) ---
    if (kategoriBukuOptions) {
        kategoriBukuOptions.querySelectorAll('.kategori-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const val = btn.dataset.category;
                if (currentFilters.category === val) {
                    currentFilters.category = '';
                    btn.classList.remove('active', 'bg-indigo-600', 'text-white');
                    btn.classList.add('bg-white', 'text-gray-700');
                } else {
                    kategoriBukuOptions.querySelectorAll('.kategori-btn').forEach(b => {
                        b.classList.remove('active', 'bg-indigo-600', 'text-white');
                        b.classList.add('bg-white', 'text-gray-700');
                    });
                    currentFilters.category = val;
                    btn.classList.add('active', 'bg-indigo-600', 'text-white');
                    btn.classList.remove('bg-white', 'text-gray-700');
                }
                loadBooks();
            });
        });
    }

    // --- Handler: Multi Genre ---
    function toggleGenre(genreValue, btnElement) {
        const index = currentFilters.genre.indexOf(genreValue);

        if (index > -1) {
            // Hapus (Toggle OFF)
            currentFilters.genre.splice(index, 1);
            if(btnElement) {
                btnElement.classList.remove('bg-purple-600', 'text-white', 'border-transparent');
                btnElement.classList.add('bg-purple-100', 'text-purple-700', 'border-purple-300');
            }
        } else {
            // Tambah (Toggle ON)
            currentFilters.genre.push(genreValue);
            if(btnElement) {
                btnElement.classList.remove('bg-purple-100', 'text-purple-700', 'border-purple-300');
                btnElement.classList.add('bg-purple-600', 'text-white', 'border-transparent');
            }
        }
        loadBooks();
    }

    if (genreBukuOptions) {
        // Tombol Genre Preset
        genreBukuOptions.querySelectorAll('.genre-btn').forEach(btn => {
            // Hindari event listener ganda pada custom tag jika dirender ulang
            if(btn.id !== 'add-genre-btn' && !btn.classList.contains('custom-genre-tag')) {
                btn.addEventListener('click', () => {
                    toggleGenre(btn.dataset.genre, btn);
                });
            }
        });

        // Custom Genre Logic
        const handleCustomGenre = () => {
            const val = customGenreInput.value.trim();
            if (!val) return;

            // Cek duplikasi
            if (!currentFilters.genre.includes(val)) {
                currentFilters.genre.push(val);
                
                // Buat tombol visual sementara
                const newBtn = document.createElement('button');
                newBtn.className = 'custom-genre-tag genre-btn px-4 py-2 bg-purple-600 text-white border border-transparent rounded-full hover:bg-purple-700 transition text-sm mr-2 mb-2';
                newBtn.innerHTML = `${val} <i class="fas fa-times ml-1 text-xs"></i>`;
                newBtn.dataset.genre = val;
                
                // Insert sebelum input container
                const inputWrapper = customGenreInput.parentElement;
                genreBukuOptions.insertBefore(newBtn, inputWrapper);

                // Event hapus saat diklik
                newBtn.addEventListener('click', () => {
                    const idx = currentFilters.genre.indexOf(val);
                    if (idx > -1) currentFilters.genre.splice(idx, 1);
                    newBtn.remove();
                    loadBooks();
                });

                loadBooks();
            }
            customGenreInput.value = '';
        };

        if (addGenreBtn) {
            addGenreBtn.addEventListener('click', handleCustomGenre);
        }
        if (customGenreInput) {
            customGenreInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') handleCustomGenre();
            });
        }
    }

    // ==========================================
    // 3. LOGIKA LOAD & RENDER BUKU
    // ==========================================

    async function loadBooks() {
        // Ambil value dari search input
        currentFilters.search = searchInput ? searchInput.value.trim() : '';

        console.log("Loading books with filters:", currentFilters);
        container.innerHTML = '<p class="col-span-full text-center text-gray-500 mt-10"><i class="fas fa-spinner fa-spin"></i> Memuat daftar...</p>';

        const params = new URLSearchParams();
        if (currentFilters.search) params.append('search', currentFilters.search);
        if (currentFilters.type) params.append('type', currentFilters.type);
        if (currentFilters.category) params.append('category', currentFilters.category);
        
        // Append multiple genre
        if (currentFilters.genre && currentFilters.genre.length > 0) {
            currentFilters.genre.forEach(g => {
                params.append('genre', g);
            });
        }

        let url = '/books';
        const queryString = params.toString();
        if (queryString) {
            url += '?' + queryString;
        }

        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error("Gagal mengambil data");
            
            const books = await res.json();
            renderBooks(books);

        } catch (err) {
            console.error("Load books error:", err);
            container.innerHTML = '<p class="col-span-full text-center text-red-500">Gagal memuat buku.</p>';
        }
    }

    function renderBooks(books) {
        container.innerHTML = '';
        if (!books || books.length === 0) {
            container.innerHTML = `
                <div class="col-span-full text-center py-10">
                    <i class="fas fa-folder-open text-gray-300 text-5xl mb-3 block"></i>
                    <p class="text-gray-500">Tidak ada buku yang cocok dengan filter.</p>
                </div>`;
            return;
        }

        books.forEach(book => {
            const card = document.createElement('div');
            card.className = 'bg-white p-4 rounded-lg shadow-sm hover:shadow-md transition flex flex-col cursor-pointer border border-gray-100 group';
            
            // Redirect ke halaman detail ADMIN
            card.addEventListener('click', () => {
                window.location.href = `buka_buku_admin.html?id=${book.id}`;
            });

            // Handle Cover
            let coverHTML;
            if (book.coverFile) {
                coverHTML = `<img src="/${book.coverFile}" alt="${book.title}" class="w-full aspect-[2/3] object-cover rounded mb-3 shadow-sm group-hover:scale-[1.02] transition-transform duration-300">`;
            } else {
                coverHTML = `
                    <div class="w-full aspect-[2/3] bg-gray-200 rounded mb-3 flex items-center justify-center">
                        <i class="fas fa-book text-gray-400 text-3xl"></i>
                    </div>`;
            }

            // Genre Badges (Visualisasi Tag)
            let genreBadges = '';
            if (book.genre) {
                const genresList = book.genre.split(',').map(s => s.trim());
                genresList.forEach(g => {
                    // Highlight jika genre sedang dipilih filter
                    const isSelected = currentFilters.genre.includes(g);
                    const activeClass = isSelected ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : 'bg-gray-50 text-gray-600 border-gray-100';
                    genreBadges += `<span class="text-[10px] px-2 py-1 rounded-md border ${activeClass} mr-1 mb-1 inline-block">${g}</span>`;
                });
            }

            // Status Stok (Visualisasi Admin)
            const stockColor = book.stock > 0 ? 'text-green-600 bg-green-50 border-green-200' : 'text-red-600 bg-red-50 border-red-200';
            const stockText = `${book.stock} Available`;

            card.innerHTML = `
                ${coverHTML}
                <div class="flex flex-wrap mb-2">${genreBadges}</div>
                <h3 class="font-bold text-lg mb-1 leading-tight line-clamp-2 text-gray-800 group-hover:text-indigo-600 transition-colors">${book.title}</h3>
                <p class="text-sm text-gray-600 mb-2">${book.author} (${book.year})</p>
                
                <div class="mt-auto pt-3 border-t border-gray-100 flex justify-between items-center text-xs">
                    <span class="text-gray-500 font-medium">${book.category || '-'}</span>
                    <span class="px-2 py-1 rounded border ${stockColor} font-semibold">
                        ${stockText}
                    </span>
                </div>
            `;

            container.appendChild(card);
        });
    }

    // --- Search Event Listeners ---
    if (searchBtn) {
        searchBtn.addEventListener('click', () => loadBooks());
    }
    if (searchInput) {
        searchInput.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') loadBooks();
        });
    }

    // Load awal
    loadBooks();
});