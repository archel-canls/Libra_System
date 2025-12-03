document.addEventListener("DOMContentLoaded", () => {
    const ebookBtn = document.getElementById("tab-ebook");
    const historyBtn = document.getElementById("tab-history");
    const searchInput = document.getElementById("search-input");
    const searchBtn = document.getElementById("search-button");
    const bookContainer = document.getElementById('book-list-container');
    const historyContainer = document.getElementById("history-container");
    const filterOptions = document.getElementById("jenis-pinjam-options");

    let activeTab = 'ebook';
    let historyStatusFilter = "";

    // ==========================================
    // 1. LOAD BOOKS (TAB BERANDA)
    // ==========================================
    async function loadBooks(searchQuery = '', type = '', category = '') {
        console.log("loadBooks called with:", { searchQuery, type, category });
        bookContainer.innerHTML = '<p class="col-span-full text-center text-gray-500">Memuat daftar...</p>';

        let url = '/books';
        const params = new URLSearchParams();

        // Search teks (Exclude filter tipe buku dari search query)
        if (searchQuery && !["Ebook", "Buku Fisik", "Fisik & Ebook"].includes(searchQuery)) {
            params.append('search', searchQuery);
        }

        if (type) params.append('type', type);
        if (category) params.append('category', category);

        if ([...params].length > 0) url += '?' + params.toString();

        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error("HTTP error " + res.status);
            const books = await res.json();

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


    // ==========================================
    // 2. LOAD HISTORY (TAMPILAN TIMELINE)
    // ==========================================
    async function loadHistory(searchQuery = '') {
        historyContainer.innerHTML = '<p class="text-center text-gray-500">Memuat riwayat...</p>';
        try {
            const res = await fetch('/api/riwayat-pinjam');
            if (!res.ok) throw new Error("Gagal mengambil data");

            const history = await res.json();
            historyContainer.innerHTML = '';

            if (!history || history.length === 0) {
                historyContainer.innerHTML = '<p class="text-center text-gray-500">Belum ada riwayat pinjam.</p>';
                return;
            }

            const filtered = history.filter(item =>
                item.bookTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
                item.id.toString().includes(searchQuery)
            );

            filtered.forEach(item => {
                const card = document.createElement('div');
                card.className = 'bg-white p-5 rounded-lg shadow-md border border-gray-100 flex flex-col md:flex-row gap-5 items-start relative hover:shadow-lg transition';

                // [PENTING] Set atribut data-status agar filter berfungsi
                const currentStatus = item.status ? item.status.toUpperCase() : "";
                card.setAttribute("data-status", currentStatus);

                // --- A. GAMBAR BUKU ---
                const img = document.createElement('img');
                img.src = item.coverFile ? '/' + item.coverFile : '/uploads/default_book.png';
                img.alt = item.bookTitle;
                img.className = 'w-24 h-36 object-cover rounded shadow-sm flex-shrink-0';
                card.appendChild(img);

                // --- B. INFORMASI (Timeline) ---
                const info = document.createElement('div');
                info.className = 'flex flex-col gap-2 flex-1 min-w-0';

                // Helper Format Tanggal
                const fmtDate = (dateStr) => {
                    if (!dateStr) return "-";
                    const d = new Date(dateStr);
                    return d.toLocaleDateString('id-ID', {
                        day: 'numeric', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit'
                    });
                };

                // Header Info
                let headerHtml = `
                    <div class="flex items-center gap-2 mb-1">
                        <span class="bg-gray-100 text-gray-600 text-[10px] font-bold px-2 py-0.5 rounded border border-gray-300">ID: ${item.id}</span>
                    </div>
                    <h3 class="text-lg font-bold text-gray-800 leading-tight truncate w-full" title="${item.bookTitle}">${item.bookTitle}</h3>
                `;

                // Logic Timeline
                let historyHtml = `<div class="mt-2 text-xs text-gray-600 space-y-1 border-l-2 border-gray-200 pl-2">`;
                historyHtml += `<p><i class="far fa-clock w-4 text-center"></i> Diajukan: <span class="font-medium text-gray-800">${fmtDate(item.dateRequested)}</span></p>`;
                
                if (item.dateApproved) historyHtml += `<p class="text-blue-600"><i class="fas fa-check w-4 text-center"></i> Disetujui: <span class="font-medium">${fmtDate(item.dateApproved)}</span></p>`;
                if (item.dateBorrowed) historyHtml += `<p class="text-indigo-600"><i class="fas fa-hand-holding w-4 text-center"></i> Dipinjam: <span class="font-medium">${fmtDate(item.dateBorrowed)}</span></p>`;
                
                if (item.dateReturned) historyHtml += `<p class="text-green-600"><i class="fas fa-undo w-4 text-center"></i> Dikembalikan: <span class="font-medium">${fmtDate(item.dateReturned)}</span></p>`;
                else if (item.dateLost) historyHtml += `<p class="text-black font-bold"><i class="fas fa-skull w-4 text-center"></i> Hilang: <span class="font-medium">${fmtDate(item.dateLost)}</span></p>`;
                else if (item.dateRejected) historyHtml += `<p class="text-red-600"><i class="fas fa-times w-4 text-center"></i> Ditolak: <span class="font-medium">${fmtDate(item.dateRejected)}</span></p>`;
                else if (item.dateCanceled) historyHtml += `<p class="text-orange-600"><i class="fas fa-ban w-4 text-center"></i> Dibatalkan: <span class="font-medium">${fmtDate(item.dateCanceled)}</span></p>`;
                
                historyHtml += `</div>`;
                info.innerHTML = headerHtml + historyHtml;

                // Logic Due Date (Keterlambatan)
                if (item.dateDue && (currentStatus === 'DIPINJAM' || currentStatus === 'DIKEMBALIKAN' || currentStatus === 'HILANG')) {
                    const dueDate = new Date(item.dateDue);
                    const now = item.dateReturned ? new Date(item.dateReturned) : (item.dateLost ? new Date(item.dateLost) : new Date());

                    let lateText = "";
                    if (now > dueDate) {
                        const diffTime = Math.abs(now - dueDate);
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                        lateText = `<span class="text-red-600 font-bold ml-1 text-xs">(Telat ${diffDays} hari)</span>`;
                    }
                    const dateDueEl = document.createElement("div");
                    dateDueEl.className = "text-sm text-gray-600 flex items-center mt-2 pt-2 border-t border-dashed border-gray-300";
                    dateDueEl.innerHTML = `<i class="fas fa-calendar-times mr-2 text-indigo-400"></i> Batas: ${fmtDate(item.dateDue)} ${lateText}`;
                    info.appendChild(dateDueEl);
                }

                // Badge Status
                const statusBadge = document.createElement("div");
                let statusColor = "bg-gray-100 text-gray-600 border-gray-200";

                if (currentStatus === 'DIAJUKAN') statusColor = "bg-yellow-100 text-yellow-800 border-yellow-300";
                else if (currentStatus === 'DISETUJUI') statusColor = "bg-blue-100 text-blue-800 border-blue-300";
                else if (currentStatus === 'DIPINJAM') statusColor = "bg-indigo-100 text-indigo-800 border-indigo-300";
                else if (currentStatus === 'DIKEMBALIKAN') statusColor = "bg-green-100 text-green-800 border-green-300";
                else if (currentStatus === 'DITOLAK' || currentStatus === 'DIBATALKAN') statusColor = "bg-red-50 text-red-600 border-red-200";
                else if (currentStatus === 'HILANG') statusColor = "bg-gray-800 text-white border-black";

                statusBadge.className = `mt-2 w-fit px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wide border ${statusColor} whitespace-nowrap shadow-sm`;
                statusBadge.textContent = currentStatus;
                info.appendChild(statusBadge);

                // Info Denda
                if (item.fineTotal > 0) {
                    const fineEl = document.createElement("div");
                    fineEl.className = "mt-2 inline-flex items-center gap-2 bg-red-50 text-red-700 px-3 py-1.5 rounded border border-red-200 w-fit";
                    fineEl.innerHTML = `
                        <i class="fas fa-money-bill-wave"></i> 
                        <span class="font-bold text-sm">Denda: Rp ${Number(item.fineTotal).toLocaleString("id-ID")}</span>
                    `;
                    info.appendChild(fineEl);
                }

                card.appendChild(info);

                // --- C. TOMBOL AKSI (KANAN) ---
                const actionsDiv = document.createElement("div");
                actionsDiv.className = "flex flex-col gap-2 w-full md:w-auto md:ml-auto md:min-w-[140px] justify-center";

                // 1. Tombol Batalkan (Hanya DIAJUKAN)
                if (currentStatus === 'DIAJUKAN') {
                    const cancelBtn = document.createElement('button');
                    cancelBtn.innerHTML = '<i class="fas fa-times"></i> Batalkan';
                    cancelBtn.className = 'w-full px-4 py-2 bg-red-500 text-white text-sm font-semibold rounded shadow hover:bg-red-600 transition flex items-center justify-center gap-2';

                    cancelBtn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        if (confirm('Batalkan pengajuan ini?')) {
                            try {
                                const res = await fetch(`/api/member/riwayat-pinjam/${item.id}`, {
                                    method: 'PATCH',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({})
                                });
                                if (res.ok) {
                                    alert('Peminjaman dibatalkan');
                                    loadHistory(searchQuery);
                                } else {
                                    const errText = await res.text();
                                    alert('Gagal: ' + errText);
                                }
                            } catch (err) {
                                console.error(err);
                                alert('Kesalahan koneksi');
                            }
                        }
                    });
                    actionsDiv.appendChild(cancelBtn);
                }

                // 2. Tombol Invoice (Jika DIKEMBALIKAN, HILANG, atau ADA DENDA)
                if (currentStatus === 'DIKEMBALIKAN' || currentStatus === 'HILANG' || item.fineTotal > 0) {
                    const invoiceBtn = document.createElement("button");
                    invoiceBtn.innerHTML = '<i class="fas fa-file-invoice"></i> Invoice';
                    invoiceBtn.className = "w-full px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded shadow hover:bg-indigo-700 transition flex items-center justify-center gap-2";
                    invoiceBtn.addEventListener("click", (e) => {
                        e.stopPropagation();
                        generateInvoice(item);
                    });
                    actionsDiv.appendChild(invoiceBtn);
                }

                // [FIX UI] Hanya tempel jika ada tombol
                if (actionsDiv.hasChildNodes()) {
                    card.appendChild(actionsDiv);
                }

                historyContainer.appendChild(card);
            });

            // Re-apply filter jika ada filter aktif
            if (historyStatusFilter) applyStatusFilter();

        } catch (err) {
            console.error(err);
            historyContainer.innerHTML = '<p class="text-center text-red-500">Gagal memuat riwayat.</p>';
        }
    }


    // ==========================================
    // 3. FILTER LOGIC
    // ==========================================
    const filterButtons = document.querySelectorAll("#jenis-pinjam-options button");

    filterButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            // Update UI Button active
            filterButtons.forEach(b => {
                b.classList.remove("ring-2", "ring-indigo-500", "bg-indigo-100");
                b.classList.add("bg-gray-200");
            });
            btn.classList.add("ring-2", "ring-indigo-500", "bg-indigo-100");
            btn.classList.remove("bg-gray-200");

            historyStatusFilter = btn.dataset.status || "";

            // Efek loading halus
            historyContainer.classList.add("opacity-0");
            loadHistory(searchInput.value.trim());

            setTimeout(() => {
                applyStatusFilter();
                historyContainer.classList.remove("opacity-0");
            }, 150);
        });
    });

    function applyStatusFilter() {
        const cards = historyContainer.querySelectorAll("div[data-status]");
        cards.forEach(card => {
            const status = card.getAttribute("data-status");
            if (historyStatusFilter === "" || status === historyStatusFilter) {
                card.classList.remove("hidden");
                card.classList.add("flex"); // Pastikan kembali ke display flex
            } else {
                card.classList.add("hidden");
                card.classList.remove("flex");
            }
        });
    }


    // ==========================================
    // 4. TAB & SEARCH HANDLING
    // ==========================================
    function resetTabs() {
        ebookBtn.classList.remove("border-indigo-600", "text-indigo-600");
        historyBtn.classList.remove("border-indigo-600", "text-indigo-600");
        bookContainer.classList.add("hidden");
        historyContainer.classList.add("hidden");
    }

    function activateTab(tab) {
        resetTabs();

        if (tab === 'ebook') {
            activeTab = 'ebook';
            ebookBtn.classList.add("border-indigo-600", "text-indigo-600");
            searchInput.placeholder = "Masukan Judul Buku atau Genre...";
            bookContainer.classList.remove("hidden");
            filterOptions.classList.add("hidden");

            loadBooks(searchInput.value.trim());
        }
        else if (tab === 'history') {
            activeTab = 'history';
            historyBtn.classList.add("border-indigo-600", "text-indigo-600");
            searchInput.placeholder = "Cari Berdasarkan ID Transaksi...";
            historyContainer.classList.remove("hidden");
            filterOptions.classList.remove("hidden");

            // Efek load awal
            historyContainer.classList.add("opacity-0");
            loadHistory(searchInput.value.trim());
            setTimeout(() => {
                applyStatusFilter();
                historyContainer.classList.remove("opacity-0");
            }, 150);
        }
    }

    ebookBtn.addEventListener('click', () => activateTab('ebook'));
    historyBtn.addEventListener('click', () => activateTab('history'));

    function performSearch() {
        if (activeTab === 'ebook') loadBooks(searchInput.value.trim());
        else if (activeTab === 'history') loadHistory(searchInput.value.trim());
    }

    searchBtn.addEventListener('click', performSearch);
    searchInput.addEventListener('keyup', e => { if (e.key === 'Enter') performSearch(); });

    // Init Load
    activateTab('ebook');
});


// ==========================================
// 5. GENERATE INVOICE PDF (Rapi & Lengkap)
// ==========================================
async function generateInvoice(item) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // Helper Date & Rupiah
    const fmt = (d) => d ? new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : "-";
    const formatRupiah = (num) => "Rp " + Number(num).toLocaleString("id-ID");

    // Header Biru
    doc.setFillColor(79, 70, 229); // Indigo
    doc.rect(0, 0, pageWidth, 40, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.text("INVOICE PEMINJAMAN", 14, 25);

    doc.setFontSize(10);
    doc.text("Libra | Library Area System", 14, 32);
    doc.text(`Dicetak: ${fmt(new Date())}`, pageWidth - 14, 32, { align: 'right' });

    // Detail Transaksi
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    doc.text("Detail Transaksi", 14, 50);

    const bodyData = [
        ["ID Transaksi", `#${item.id}`],
        ["Judul Buku", item.bookTitle],
        ["Status Akhir", item.status],
        ["Tanggal Diajukan", fmt(item.dateRequested)],
        ["Tanggal Dipinjam", fmt(item.dateBorrowed)],
        ["Batas Pengembalian", fmt(item.dateDue)],
        ["Tanggal Dikembalikan", fmt(item.dateReturned) || (item.dateLost ? `${fmt(item.dateLost)} (Hilang)` : "-")],
    ];

    doc.autoTable({
        startY: 55,
        body: bodyData,
        theme: 'plain',
        styles: { fontSize: 10, cellPadding: 2 },
        columnStyles: {
            0: { fontStyle: 'bold', cellWidth: 50 },
            1: { cellWidth: 'auto' }
        }
    });

    // Rincian Biaya (Denda)
    let finalY = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(12);
    doc.text("Rincian Biaya", 14, finalY);

    const fineData = [
        ["Total Denda Keterlambatan / Ganti Rugi", formatRupiah(item.fineTotal)]
    ];

    doc.autoTable({
        startY: finalY + 5,
        head: [['Deskripsi', 'Jumlah']],
        body: fineData,
        theme: 'grid',
        headStyles: { fillColor: [220, 220, 220], textColor: [0, 0, 0] },
        styles: { fontSize: 10, cellPadding: 3 },
        columnStyles: {
            0: { cellWidth: 'auto' },
            1: { cellWidth: 50, halign: 'right', fontStyle: 'bold' }
        }
    });

    // Footer
    finalY = doc.lastAutoTable.finalY + 20;
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text("Terima kasih telah menggunakan layanan perpustakaan kami.", 14, finalY);
    doc.text("Harap simpan dokumen ini sebagai bukti.", 14, finalY + 5);

    doc.save(`Invoice_Libra_${item.id}.pdf`);
}