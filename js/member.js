console.log("member.js loaded");

// Variabel Global untuk menyimpan status filter saat ini
let currentFilters = {
    search: '',
    type: '',
    category: '',
    genre: [] // UBAH: Genre sekarang berupa Array untuk menampung banyak tag
};

document.addEventListener("DOMContentLoaded", () => {
    console.log("DOM fully loaded (member.js)");

    const container = document.getElementById('book-list-container');
    const searchInput = document.getElementById('search-input');
    const searchBtn = document.getElementById('search-button');
    
    // Filter Containers
    const kategoriBukuOptions = document.getElementById('kategori-buku-options');
    const jenisBukuOptions = document.getElementById('jenis-buku-options');
    const genreBukuOptions = document.getElementById('genre-buku-options');
    
    // Filter Logic UI
    const filterBtn = document.getElementById('filter-button');
    const filterDropdown = document.getElementById('filter-dropdown');
    const currentFilterText = document.getElementById('current-filter-text');

    // Input Custom Genre
    const customGenreInput = document.getElementById('custom-genre-input');
    const addGenreBtn = document.getElementById('add-genre-btn');

    // --- Toggle Filter Dropdown ---
    if (filterBtn && filterDropdown) {
        filterBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            filterDropdown.classList.toggle('show');
        });

        document.addEventListener('click', (e) => {
            if (!filterBtn.contains(e.target) && !filterDropdown.contains(e.target)) {
                filterDropdown.classList.remove('show');
            }
        });
    }

    // --- Helper: Reset UI Filter Aktif ---
    function hideAllFilterOptions() {
        if (jenisBukuOptions) jenisBukuOptions.classList.add("hidden");
        if (kategoriBukuOptions) kategoriBukuOptions.classList.add("hidden");
        if (genreBukuOptions) genreBukuOptions.classList.add("hidden");
    }

    // --- Helper: Update Text Filter di Tombol ---
    function updateFilterLabel(text) {
        if (currentFilterText) currentFilterText.textContent = text;
    }

    // --- Saat klik salah satu item di Dropdown Filter ---
    if (filterDropdown) {
        filterDropdown.querySelectorAll('a').forEach(a => {
            a.addEventListener('click', (e) => {
                e.preventDefault();
                const filterType = a.dataset.filter;
                
                filterDropdown.classList.remove('show');
                hideAllFilterOptions();

                // Reset filter tipe & kategori (single value), tapi genre kita biarkan user reset manual atau reset jika pindah ke 'all'
                if (filterType !== 'genre') {
                    // Jika pindah menu selain genre, reset array genre (opsional, tergantung UX yg dimau)
                    // currentFilters.genre = []; 
                    // renderActiveGenres(); // Function helper jika perlu refresh UI
                }

                if (filterType === "all") {
                    updateFilterLabel("Semua");
                    // Reset Semua
                    currentFilters.type = '';
                    currentFilters.category = '';
                    currentFilters.genre = [];
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
                // Toggle off jika diklik lagi
                if (currentFilters.type === val) {
                    currentFilters.type = '';
                    btn.classList.remove('bg-gray-400', 'text-white');
                    btn.classList.add('bg-gray-200', 'text-gray-800');
                } else {
                    jenisBukuOptions.querySelectorAll('.jenis-btn').forEach(b => {
                        b.classList.remove('bg-gray-400', 'text-white');
                        b.classList.add('bg-gray-200', 'text-gray-800');
                    });
                    currentFilters.type = val;
                    btn.classList.remove('bg-gray-200', 'text-gray-800');
                    btn.classList.add('bg-gray-400', 'text-white');
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
                    btn.classList.remove('bg-gray-400', 'text-white');
                    btn.classList.add('bg-gray-200');
                } else {
                    kategoriBukuOptions.querySelectorAll('.kategori-btn').forEach(b => {
                        b.classList.remove('active', 'bg-gray-400', 'text-white');
                        b.classList.add('bg-gray-200');
                    });
                    currentFilters.category = val;
                    btn.classList.remove('bg-gray-200');
                    btn.classList.add('active', 'bg-gray-400', 'text-white');
                }
                loadBooks();
            });
        });
    }

    // ==========================================
    // --- LOGIKA BARU: MULTI GENRE SELECT ---
    // ==========================================
    
    function resetGenreUI() {
        if (!genreBukuOptions) return;
        genreBukuOptions.querySelectorAll('.genre-btn').forEach(b => {
            b.classList.remove('bg-purple-600', 'text-white', 'border-transparent');
            b.classList.add('bg-purple-100', 'text-purple-700', 'border-purple-300');
        });
        // Hapus tombol custom yang dibuat dinamis (opsional)
        document.querySelectorAll('.custom-genre-tag').forEach(el => el.remove());
    }

    function toggleGenre(genreValue, btnElement) {
        const index = currentFilters.genre.indexOf(genreValue);

        if (index > -1) {
            // Hapus jika sudah ada (Toggle OFF)
            currentFilters.genre.splice(index, 1);
            if(btnElement) {
                btnElement.classList.remove('bg-purple-600', 'text-white', 'border-transparent');
                btnElement.classList.add('bg-purple-100', 'text-purple-700', 'border-purple-300');
            }
        } else {
            // Tambah jika belum ada (Toggle ON)
            currentFilters.genre.push(genreValue);
            if(btnElement) {
                btnElement.classList.remove('bg-purple-100', 'text-purple-700', 'border-purple-300');
                btnElement.classList.add('bg-purple-600', 'text-white', 'border-transparent');
            }
        }
        console.log("Active Genres:", currentFilters.genre);
        loadBooks();
    }

    if (genreBukuOptions) {
        // Handler untuk tombol genre bawaan
        genreBukuOptions.querySelectorAll('.genre-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                toggleGenre(btn.dataset.genre, btn);
            });
        });

        // Handler untuk Custom Genre (+ Input)
        const handleCustomGenre = () => {
            const val = customGenreInput.value.trim();
            if (!val) return;

            // Cek apakah sudah ada di array (case insensitive check optional)
            if (!currentFilters.genre.includes(val)) {
                // Tambahkan ke array
                currentFilters.genre.push(val);
                
                // Buat tombol visual sementara agar user bisa menghapusnya (toggle off)
                const newBtn = document.createElement('button');
                newBtn.className = 'custom-genre-tag genre-btn px-4 py-2 bg-purple-600 text-white border border-transparent rounded-full hover:bg-purple-700 transition text-sm';
                newBtn.textContent = val + " x"; // Tambah tanda silang
                newBtn.dataset.genre = val;
                
                // Insert sebelum input text
                const inputWrapper = customGenreInput.parentElement;
                genreBukuOptions.insertBefore(newBtn, inputWrapper);

                // Event listener untuk tombol baru ini (klik untuk hapus)
                newBtn.addEventListener('click', () => {
                    const idx = currentFilters.genre.indexOf(val);
                    if (idx > -1) currentFilters.genre.splice(idx, 1);
                    newBtn.remove();
                    loadBooks();
                });

                loadBooks();
            }
            
            // Reset input
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

    // --- Fungsi Utama Memuat Buku ---
    async function loadBooks() {
        currentFilters.search = searchInput ? searchInput.value.trim() : '';

        console.log("Loading books with filters:", currentFilters);
        container.innerHTML = '<p class="col-span-full text-center text-gray-500 mt-10"><i class="fas fa-spinner fa-spin"></i> Memuat daftar...</p>';

        const params = new URLSearchParams();
        if (currentFilters.search) params.append('search', currentFilters.search);
        if (currentFilters.type) params.append('type', currentFilters.type);
        if (currentFilters.category) params.append('category', currentFilters.category);
        
        // --- UBAH: Append setiap genre dalam array sebagai parameter terpisah ---
        // Hasilnya nanti: ?genre=Horor&genre=Komedi
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

    // --- Render Buku ke HTML ---
    function renderBooks(books) {
        container.innerHTML = '';
        if (!books || books.length === 0) {
            container.innerHTML = `
                <div class="col-span-full text-center py-10">
                    <i class="fas fa-book-open text-gray-300 text-5xl mb-3 block"></i>
                    <p class="text-gray-500">Tidak ada buku yang cocok dengan filter.</p>
                </div>`;
            return;
        }

        books.forEach(book => {
            const card = document.createElement('div');
            card.className = 'bg-white p-4 rounded-lg shadow hover:shadow-lg transition flex flex-col cursor-pointer border border-gray-100';
            
            card.addEventListener('click', () => {
                window.location.href = `/buka_buku_member.html?id=${book.id}`;
            });

            // Handle Cover
            let coverHTML;
            if (book.coverFile) {
                coverHTML = `<img src="/${book.coverFile}" alt="${book.title}" class="w-full aspect-[2/3] object-cover rounded mb-3 shadow-sm">`;
            } else {
                coverHTML = `
                    <div class="w-full aspect-[2/3] bg-gray-200 rounded mb-3 flex items-center justify-center">
                        <i class="fas fa-book text-gray-400 text-3xl"></i>
                    </div>`;
            }

            // Label Genre (Bisa banyak, dipisah koma)
            let genreBadges = '';
            if (book.genre) {
                // Split genre string dari DB (misal "Horor, Komedi") jadi array
                const genresList = book.genre.split(',').map(s => s.trim());
                genresList.forEach(g => {
                    // Highlight genre yang sedang dicari
                    const isSelected = currentFilters.genre.includes(g);
                    const activeClass = isSelected ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : 'bg-gray-50 text-gray-600 border-gray-100';
                    genreBadges += `<span class="text-[10px] px-2 py-1 rounded-md border ${activeClass} mr-1 mb-1 inline-block">${g}</span>`;
                });
            }

            card.innerHTML = `
                ${coverHTML}
                <div class="flex flex-wrap mb-2">${genreBadges}</div>
                <h3 class="font-bold text-lg mb-1 leading-tight line-clamp-2 text-gray-800">${book.title}</h3>
                <p class="text-sm text-gray-600 mb-2">${book.author} (${book.year})</p>
                <div class="mt-auto pt-2 border-t border-gray-100 flex justify-between items-center text-xs text-gray-500">
                    <span>${book.category || '-'}</span>
                    <span class="${book.stock > 0 ? 'text-green-600 font-medium' : 'text-red-500'}">
                        ${book.stock > 0 ? 'Tersedia' : 'Habis'}
                    </span>
                </div>
            `;

            container.appendChild(card);
        });
    }

    // --- Event Search Button & Enter ---
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
    // ==========================================
    // --- CAROUSEL LOGIC (GO API) ---
    // ==========================================
    const carouselInner = document.getElementById('carousel-inner');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    
    let carouselData = [];
    let currentCarouselIndex = 0;
    let autoSlideInterval;

    async function initCarousel() {
        if (!carouselInner) return;

        try {
            // Fetch ke Backend Go
            const res = await fetch('/api/books/random'); 
            if (!res.ok) throw new Error("Gagal load carousel");
            
            carouselData = await res.json();
            renderCarousel(carouselData);

        } catch (err) {
            console.error("Carousel error:", err);
            carouselInner.innerHTML = `
                <div class="w-full h-40 flex items-center justify-center text-gray-400">
                    Gagal memuat rekomendasi.
                </div>`;
        }
    }

    function renderCarousel(books) {
        carouselInner.innerHTML = '';
        
        if (!books || books.length === 0) {
            carouselInner.innerHTML = '<div class="p-10 text-center w-full">Tidak ada rekomendasi saat ini.</div>';
            return;
        }

        books.forEach((book, index) => {
            // Potong sinopsis jika terlalu panjang
            let synopsis = book.synopsis || "Tidak ada deskripsi.";
            if (synopsis.length > 150) synopsis = synopsis.substring(0, 150) + "...";

            // Cover handling
            let coverSrc = book.cover ? `/${book.cover}` : '/img/default_book.png'; // Sesuaikan path

            const item = document.createElement('a');
            item.className = 'carousel-item-link';
            // Link ke detail buku member
            item.href = `/buka_buku_member.html?id=${book.id}`; 
            
            item.innerHTML = `
                <div class="carousel-cover-container">
                    <img src="${coverSrc}" alt="${book.title}" onerror="this.src='/img/default_book.png'">
                </div>
                <div class="carousel-text">
                    <h3 class="text-xl sm:text-2xl font-bold text-indigo-900 mb-1 leading-tight line-clamp-2">${book.title}</h3>
                    <p class="text-sm font-semibold text-indigo-600 mb-2">${book.author}</p>
                    <p class="text-gray-600 text-xs sm:text-sm leading-relaxed">${synopsis}</p>
                </div>
            `;
            carouselInner.appendChild(item);
        });

        // Show buttons jika buku > 1
        if (books.length > 1) {
            if(prevBtn) prevBtn.classList.remove('hidden');
            if(nextBtn) nextBtn.classList.remove('hidden');
            startAutoSlide();
        }
    }

    function goToSlide(index) {
        if (carouselData.length === 0) return;
        currentCarouselIndex = (index + carouselData.length) % carouselData.length;
        const offset = -currentCarouselIndex * 100;
        carouselInner.style.transform = `translateX(${offset}%)`;
    }

    function nextSlide() {
        goToSlide(currentCarouselIndex + 1);
    }

    function prevSlide() {
        goToSlide(currentCarouselIndex - 1);
    }

    function startAutoSlide() {
        clearInterval(autoSlideInterval);
        autoSlideInterval = setInterval(nextSlide, 5000); // Ganti slide tiap 5 detik
    }

    // Event Listeners
    if (prevBtn) {
        prevBtn.addEventListener('click', (e) => {
            e.preventDefault(); 
            prevSlide(); 
            startAutoSlide(); // Reset timer saat diklik manual
        });
    }
    if (nextBtn) {
        nextBtn.addEventListener('click', (e) => {
            e.preventDefault(); 
            nextSlide(); 
            startAutoSlide();
        });
    }

    // Jalankan Carousel
    initCarousel();
});