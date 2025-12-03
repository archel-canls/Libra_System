document.addEventListener("DOMContentLoaded", () => {
    const searchInput = document.getElementById("search-input");
    const searchBtn = document.getElementById("search-button");
    const bookListContainer = document.getElementById("book-list-container");

    // Modal Elements
    const reportModal = document.getElementById("report-modal");
    const btnOpenReport = document.getElementById("btn-open-report");
    const btnCloseReport = document.getElementById("btn-close-report");
    const btnPrintProcess = document.getElementById("btn-print-process");
    const reportMonth = document.getElementById("report-month");
    const reportYear = document.getElementById("report-year");

    // Set default year
    if(reportYear) reportYear.value = new Date().getFullYear();
    if(reportMonth) reportMonth.value = new Date().getMonth();

    const statuses = ['DIAJUKAN', 'DIPINJAM','DITOLAK','DIKEMBALIKAN','HILANG', 'DIBATALKAN'];
    const adminStatuses = ['DIPINJAM','DITOLAK','DIKEMBALIKAN','HILANG'];

    let adminStatusFilter = "";
    
    // 🔥 Simpan data global untuk keperluan laporan
    let allTransactionsData = []; 

   // ==========================================
    // 1. LOAD DATA PINJAMAN (Tampilan Diperbaiki)
    // ==========================================
    async function loadDaftarPinjam(searchQuery = '') {
        bookListContainer.innerHTML = `<p class="text-center text-gray-500">Memuat daftar...</p>`;

        try {
            const res = await fetch("http://localhost:8080/api/admin/daftar-pinjam/", {
                credentials: "include"
            });
            if (!res.ok) throw new Error("Gagal memuat data");

            const data = await res.json();
            allTransactionsData = data; 
            bookListContainer.innerHTML = '';

            if (!data || data.length === 0) {
                bookListContainer.innerHTML = `<p class="text-center text-gray-500">Belum ada pengajuan</p>`;
                return;
            }

            const filtered = data.filter(item =>
                item.id.toString().includes(searchQuery) || 
                (item.userName && item.userName.toLowerCase().includes(searchQuery.toLowerCase()))
            );

            filtered.forEach(item => {
                // Layout Card: Gunakan Flex row agar rapi kiri-kanan
                const card = document.createElement("div");
                card.className = "bg-white p-5 rounded-lg shadow-md border border-gray-100 flex flex-col md:flex-row gap-5 items-start relative hover:shadow-lg transition";
                
                // Normalisasi Status
                const currentStatus = item.status ? item.status.toUpperCase() : "";
                card.setAttribute("data-status", currentStatus);

                // --- A. GAMBAR BUKU (KIRI) ---
                const img = document.createElement("img");
                img.src = item.coverFile ? "/" + item.coverFile : "/uploads/default_book.png";
                img.alt = item.bookTitle;
                img.className = "w-24 h-36 object-cover rounded shadow-sm flex-shrink-0";
                card.appendChild(img);

       // --- B. INFORMASI (TENGAH) ---
                const info = document.createElement("div");
                info.className = "flex flex-col gap-2 flex-1 min-w-0";

                // 1. Helper Format Tanggal (Agar ada Jam-nya)
                const fmtDate = (dateStr) => {
                    if (!dateStr) return "-";
                    const d = new Date(dateStr);
                    // Format: 17 Agu 2025 14:30
                    return d.toLocaleDateString('id-ID', { 
                        day: 'numeric', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit'
                    });
                };

                // 2. Header (ID & Judul)
                let headerHtml = `
                    <div class="flex items-center gap-2 mb-1">
                        <span class="bg-gray-100 text-gray-600 text-[10px] font-bold px-2 py-0.5 rounded border border-gray-300">ID: ${item.id}</span>
                        <span class="text-xs text-gray-500"><i class="far fa-user"></i> ${item.userName}</span>
                    </div>
                    <h3 class="text-lg font-bold text-gray-800 leading-tight truncate w-full" title="${item.bookTitle}">${item.bookTitle}</h3>
                `;

                // 3. History Timeline (Logika Tampilan Tanggal Bertingkat)
                let historyHtml = `<div class="mt-2 text-xs text-gray-600 space-y-1 border-l-2 border-gray-200 pl-2">`;

                // a. Selalu ada: Diajukan
                historyHtml += `<p><i class="far fa-clock w-4 text-center"></i> Diajukan: <span class="font-medium text-gray-800">${fmtDate(item.dateRequested)}</span></p>`;

                // b. Disetujui
                if (item.dateApproved) {
                    historyHtml += `<p class="text-blue-600"><i class="fas fa-check w-4 text-center"></i> Disetujui: <span class="font-medium">${fmtDate(item.dateApproved)}</span></p>`;
                }

                // c. Dipinjam (Serah Terima)
                if (item.dateBorrowed) {
                    historyHtml += `<p class="text-indigo-600"><i class="fas fa-hand-holding w-4 text-center"></i> Dipinjam: <span class="font-medium">${fmtDate(item.dateBorrowed)}</span></p>`;
                }

                // d. Status Akhir (Salah satu dari: Kembali, Hilang, Tolak, Batal)
                if (item.dateReturned) {
                    historyHtml += `<p class="text-green-600"><i class="fas fa-undo w-4 text-center"></i> Dikembalikan: <span class="font-medium">${fmtDate(item.dateReturned)}</span></p>`;
                } else if (item.dateLost) {
                    historyHtml += `<p class="text-black font-bold"><i class="fas fa-skull w-4 text-center"></i> Hilang: <span class="font-medium">${fmtDate(item.dateLost)}</span></p>`;
                } else if (item.dateRejected) {
                    historyHtml += `<p class="text-red-600"><i class="fas fa-times w-4 text-center"></i> Ditolak: <span class="font-medium">${fmtDate(item.dateRejected)}</span></p>`;
                } else if (item.dateCanceled) {
                    historyHtml += `<p class="text-orange-600"><i class="fas fa-ban w-4 text-center"></i> Dibatalkan: <span class="font-medium">${fmtDate(item.dateCanceled)}</span></p>`;
                }

                historyHtml += `</div>`;

                // Gabungkan Header + History ke dalam Info
                info.innerHTML = headerHtml + historyHtml;

                // 4. Tampilkan Due Date & Keterlambatan (Hanya jika status DIPINJAM/HIlang/Kembali)
                if (item.dateDue && (currentStatus === 'DIPINJAM' || currentStatus === 'DIKEMBALIKAN' || currentStatus === 'HILANG')) {
                    const dueDate = new Date(item.dateDue);
                    // Cek tanggal 'sekarang' berdasarkan status (kalau sudah kembali, pakai tgl kembali)
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

                // 5. BADGE STATUS (Tetap Dipertahankan)
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

                // 6. Info Denda
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
                // ml-auto memaksa div ini nempel ke kanan
                const actionsDiv = document.createElement("div");
                actionsDiv.className = "flex flex-col gap-2 w-full md:w-auto md:ml-auto md:min-w-[160px] justify-center";

                // Helper function buat tombol
                const createBtn = (label, colorClass, newStatus, iconClass) => {
                    const btn = document.createElement("button");
                    btn.className = `w-full px-4 py-2 rounded-md text-white text-sm font-semibold shadow hover:shadow-md transition-all active:scale-95 flex items-center justify-center gap-2 ${colorClass}`;
                    btn.innerHTML = `<i class="${iconClass}"></i> ${label}`;
                    
                    // Kita kirim item lengkap ke updateStatus untuk perhitungan denda hilang
                    btn.addEventListener("click", () => updateStatus(item, newStatus));
                    return btn;
                };

                // LOGIKA TOMBOL
                if (currentStatus === 'DIAJUKAN') {
                    actionsDiv.appendChild(createBtn("Setujui", "bg-blue-600 hover:bg-blue-700", "DISETUJUI", "fas fa-check"));
                    actionsDiv.appendChild(createBtn("Tolak", "bg-red-500 hover:bg-red-600", "DITOLAK", "fas fa-times"));
                
                } else if (currentStatus === 'DISETUJUI') {
                    const pickupNote = document.createElement("div");
                    pickupNote.className = "text-[10px] text-indigo-600 bg-indigo-50 border border-indigo-100 p-1 rounded text-center mb-1 font-medium";
                    pickupNote.innerHTML = "<i class='fas fa-info-circle'></i> Member ambil buku";
                    actionsDiv.appendChild(pickupNote);

                    actionsDiv.appendChild(createBtn("Serahkan Buku", "bg-indigo-600 hover:bg-indigo-700", "DIPINJAM", "fas fa-hand-holding"));
                    actionsDiv.appendChild(createBtn("Batalkan", "bg-orange-500 hover:bg-orange-600", "DIBATALKAN", "fas fa-ban"));

                } else if (currentStatus === 'DIPINJAM') {
                    actionsDiv.appendChild(createBtn("Terima Kembali", "bg-green-600 hover:bg-green-700", "DIKEMBALIKAN", "fas fa-undo"));
                    // Tombol Hitam untuk Hilang
                    actionsDiv.appendChild(createBtn("Buku Hilang", "bg-gray-800 hover:bg-gray-900", "HILANG", "fas fa-skull"));

                } else {
                    const finalMsg = document.createElement("div");
                    finalMsg.className = "text-xs text-gray-400 italic text-center border border-gray-200 rounded p-2 bg-gray-50";
                    finalMsg.textContent = "Transaksi Selesai";
                    actionsDiv.appendChild(finalMsg);
                }

                card.appendChild(actionsDiv);
                bookListContainer.appendChild(card);
            });
            
            if(adminStatusFilter) applyAdminStatusFilter();

        } catch (err) {
            console.error(err);
            bookListContainer.innerHTML = `<p class="text-center text-red-500">Gagal memuat daftar.</p>`;
        }
    }

    // ==========================================
    // 2. FUNGSI UPDATE STATUS (Dengan Logika Hitung Denda Hilang)
    // ==========================================
    async function updateStatus(item, newStatus) {
        const id = item.id;
        const currentFine = item.fineTotal || 0;
        const bookPrice = item.bookPrice || 0; // Didapat dari main.go yg baru

        let confirmMsg = `Ubah status menjadi ${newStatus}?`;

        if (newStatus === 'DIPINJAM') {
            confirmMsg = "Serahkan buku ke member? (Waktu pinjam 7 hari dimulai dari sekarang).";
        }
        else if (newStatus === 'DIKEMBALIKAN') {
            confirmMsg = "Buku sudah diterima kembali fisik?";
            if (currentFine > 0) {
                confirmMsg += `\n\n⚠️ PERHATIAN: Member memiliki denda keterlambatan Rp ${currentFine.toLocaleString("id-ID")}. Pastikan sudah dibayar.`;
            }
        }
        else if (newStatus === 'HILANG') {
            // HITUNG TOTAL DENDA (Denda Telat + Harga Buku)
            const totalBayar = currentFine + bookPrice;
            
            confirmMsg = `Konfirmasi Buku HILANG?\n` +
                         `==================================\n` +
                         `Denda Keterlambatan : Rp ${currentFine.toLocaleString("id-ID")}\n` +
                         `Ganti Rugi Buku     : Rp ${bookPrice.toLocaleString("id-ID")}\n` +
                         `==================================\n` +
                         `TOTAL DIBAYAR       : Rp ${totalBayar.toLocaleString("id-ID")}\n\n` +
                         `Lanjutkan status menjadi HILANG?`;
        }

        if (!confirm(confirmMsg)) return;

        try {
            const res = await fetch(`http://localhost:8080/api/admin/daftar-pinjam/${id}`, {
                method: "PATCH",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: newStatus })
            });
            
            if (!res.ok) {
                const txt = await res.text();
                throw new Error(txt);
            }
            
            alert("Status berhasil diperbarui!");
            loadDaftarPinjam(searchInput.value.trim());

        } catch (err) {
            alert("Gagal update status: " + err.message);
        }
    }
    // [PENTING] Update Fungsi Filter agar membaca atribut data-status
    function applyAdminStatusFilter() {
        const cards = bookListContainer.querySelectorAll("div[data-status]");
        cards.forEach(card => {
            const status = card.getAttribute("data-status");
            if (adminStatusFilter === "" || status === adminStatusFilter) {
                card.classList.remove("hidden");
                card.classList.add("flex"); // Pastikan display flex tetap ada
            } else {
                card.classList.add("hidden");
                card.classList.remove("flex");
            }
        });
    }
    const adminFilterButtons = document.querySelectorAll("#admin-filter-options button");
    adminFilterButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            adminStatusFilter = btn.dataset.status || "";
            bookListContainer.classList.add("opacity-0");
            setTimeout(() => {
                applyAdminStatusFilter();
                bookListContainer.classList.remove("opacity-0");
            }, 150);
        });
    });

    // --- SEARCH ---
    function performSearch() {
        loadDaftarPinjam(searchInput.value.trim());
    }
    searchBtn.addEventListener("click", performSearch);
    searchInput.addEventListener("keyup", e => { if (e.key === "Enter") performSearch(); });

    // ==========================================
    // 🔥 LOGIKA CETAK LAPORAN (PDF) 🔥
    // ==========================================

    // 1. Toggle Modal
    if(btnOpenReport) {
        btnOpenReport.addEventListener("click", () => {
            reportModal.classList.remove("hidden");
        });
    }

    if(btnCloseReport) {
        btnCloseReport.addEventListener("click", () => {
            reportModal.classList.add("hidden");
        });
    }

    // Close on outside click
    window.addEventListener("click", (e) => {
        if (e.target === reportModal) {
            reportModal.classList.add("hidden");
        }
    });

    // 2. Generate PDF
    if(btnPrintProcess) {
        btnPrintProcess.addEventListener("click", () => {
            const monthIndex = parseInt(reportMonth.value);
            const year = parseInt(reportYear.value);
            
            // Nama bulan array
            const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
            const selectedMonthName = monthNames[monthIndex];

            generateMonthlyPDF(monthIndex, year, selectedMonthName);
        });
    }

   // ==========================================
    // FUNGSI CETAK LAPORAN PDF LENGKAP
    // ==========================================
    function generateMonthlyPDF(monthIndex, year, monthName) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        // --- 1. Header Laporan ---
        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.text(`Laporan Peminjaman - ${monthName} ${year}`, 14, 20);
        
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text("Libra|Library Area System", 14, 26);
        doc.text(`Dicetak pada: ${new Date().toLocaleDateString('id-ID')}`, 14, 31);
        
        // Garis pembatas header
        doc.setLineWidth(0.5);
        doc.line(14, 35, 196, 35);

        // --- 2. Persiapan Data ---
        const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
        const tableBody = [];
        const formatRupiah = (num) => "Rp " + Number(num).toLocaleString("id-ID");

        // Variabel untuk Total Ringkasan
        let totalPeminjaman = 0;
        let totalPengembalian = 0;
        let totalBukuHilang = 0;
        let totalDendaMasuk = 0; // Akumulasi uang denda

        // Loop per hari dalam bulan tersebut
        for (let d = 1; d <= daysInMonth; d++) {
            let dipinjamList = [];
            let dikembalikanList = [];

            // Filter data transaksi
            allTransactionsData.forEach(trx => {
                
                // A. Cek Peminjaman (Buku Keluar) - Berdasarkan dateApproved
                if (trx.dateApproved) {
                    const approveDate = new Date(trx.dateApproved);
                    if (approveDate.getDate() === d && approveDate.getMonth() === monthIndex && approveDate.getFullYear() === year) {
                        const letter = String.fromCharCode(97 + dipinjamList.length); // a, b, c...
                        dipinjamList.push(`${letter}. ${trx.userName} - ${trx.bookTitle}`);
                        totalPeminjaman++;
                    }
                }

                // B. Cek Pengembalian (Buku Masuk) - Berdasarkan dateReturned
                if (trx.dateReturned && trx.status === 'DIKEMBALIKAN') {
                    const returnDate = new Date(trx.dateReturned);
                    if (returnDate.getDate() === d && returnDate.getMonth() === monthIndex && returnDate.getFullYear() === year) {
                        const letter = String.fromCharCode(97 + dikembalikanList.length);
                        
                        let info = `${letter}. ${trx.userName} (Kembali)`;
                        
                        // Cek Denda Keterlambatan
                        if (trx.fineTotal > 0) {
                            info += ` [Denda: ${formatRupiah(trx.fineTotal)}]`;
                            totalDendaMasuk += trx.fineTotal;
                        }
                        
                        dikembalikanList.push(info);
                        totalPengembalian++;
                    }
                }

                // C. Cek Buku Hilang - Berdasarkan dateLost (Prioritas) atau dateReturned jika dateLost kosong
                // Logika: Jika status HILANG, kita cek kapan hilangnya
                if (trx.status === 'HILANG') {
                    // Gunakan dateLost jika ada, jika tidak fallback ke dateReturned
                    const rawDate = trx.dateLost ? trx.dateLost : trx.dateReturned;
                    
                    if (rawDate) {
                        const lostDate = new Date(rawDate);
                        if (lostDate.getDate() === d && lostDate.getMonth() === monthIndex && lostDate.getFullYear() === year) {
                            const letter = String.fromCharCode(97 + dikembalikanList.length);
                            
                            // Info lengkap untuk buku hilang
                            let info = `${letter}. ${trx.userName} - ${trx.bookTitle} (HILANG)`;
                            info += `\n   [Total Ganti Rugi: ${formatRupiah(trx.fineTotal)}]`;
                            
                            dikembalikanList.push(info);
                            totalBukuHilang++;
                            totalDendaMasuk += trx.fineTotal;
                        }
                    }
                }
            });

            // Hanya masukkan ke tabel jika ada aktivitas pada tanggal tersebut
            if (dipinjamList.length > 0 || dikembalikanList.length > 0) {
                tableBody.push([
                    d.toString(), // Tanggal
                    dipinjamList.length > 0 ? dipinjamList.join("\n") : "-",
                    dikembalikanList.length > 0 ? dikembalikanList.join("\n") : "-"
                ]);
            }
        }

        // Jika tidak ada data sama sekali
        if(tableBody.length === 0) {
            alert(`Tidak ada data transaksi pada bulan ${monthName} ${year}`);
            return;
        }

        // --- 3. Render Tabel Transaksi ---
        doc.autoTable({
            startY: 40,
            head: [['Tgl', 'Peminjaman Buku', 'Pengembalian / Hilang & Denda']],
            body: tableBody,
            theme: 'grid',
            headStyles: { 
                fillColor: [79, 70, 229], // Warna Indigo
                halign: 'center',
                valign: 'middle'
            },
            styles: { 
                fontSize: 8, 
                cellPadding: 3, 
                valign: 'top',
                overflow: 'linebreak' 
            },
            columnStyles: {
                0: { cellWidth: 10, halign: 'center', fontStyle: 'bold' }, // Kolom Tanggal
                1: { cellWidth: 85 },
                2: { cellWidth: 95 }
            },
            // Agar baris tabel selang-seling warnanya
            alternateRowStyles: {
                fillColor: [245, 247, 255]
            }
        });

        // --- 4. Render Ringkasan (Summary Box) ---
        // Menghitung posisi Y setelah tabel selesai
        let finalY = doc.lastAutoTable.finalY + 10;
        
        // Cek jika halaman tidak cukup, tambah halaman baru
        if (finalY > 250) {
            doc.addPage();
            finalY = 20;
        }

        doc.setFillColor(240, 240, 240);
        doc.rect(14, finalY, 100, 45, 'F'); // Kotak background abu-abu
        doc.setDrawColor(200, 200, 200);
        doc.rect(14, finalY, 100, 45, 'S'); // Garis border

        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.text("Ringkasan Bulanan", 19, finalY + 8);

        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        
        // Detail Ringkasan
        doc.text(`Total Peminjaman: ${totalPeminjaman} Buku`, 19, finalY + 16);
        doc.text(`Total Pengembalian: ${totalPengembalian} Buku`, 19, finalY + 22);
        doc.text(`Total Buku Hilang: ${totalBukuHilang} Buku`, 19, finalY + 28);
        
        doc.setFont("helvetica", "bold");
        doc.setTextColor(180, 0, 0); // Warna merah untuk uang
        doc.text(`Total Pendapatan Denda: ${formatRupiah(totalDendaMasuk)}`, 19, finalY + 38);

        // --- 5. Simpan File ---
        doc.save(`Laporan_Keuangan_${monthName}_${year}.pdf`);
        reportModal.classList.add("hidden");
    }

    // Load Data Awal
    loadDaftarPinjam();
});