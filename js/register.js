document.addEventListener('DOMContentLoaded', function() {
    // Preview foto profil
    document.getElementById("foto-upload").addEventListener("change", function () {
        const file = this.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function (e) {
            document.getElementById("profile_picture_data").value = e.target.result;
            document.getElementById("foto-preview").src = e.target.result;
        };
        reader.readAsDataURL(file);
    });

    // Batasi input No HP hanya angka
    const nohpInput = document.getElementById('nohp');
    nohpInput.addEventListener('input', function() {
        this.value = this.value.replace(/\D/g,''); // hapus semua yang bukan angka
    });

    // Fungsi lanjut ke Step 2
    window.lanjutKeStep2 = function() {
        const nama = document.getElementById('nama').value;
        const alamat = document.getElementById('alamat').value;
        const nohp = document.getElementById('nohp').value;
        const email = document.getElementById('email').value;
        const fotoUpload = document.getElementById('foto-upload');
        const profilePictureData = document.getElementById('profile_picture_data');

        if (!nama || !alamat || !nohp || !email || !fotoUpload.files[0]) {
            alert("Semua field wajib diisi pada langkah 1.");
            return;
        }

        const reader = new FileReader();
        reader.onload = function(e) {
            profilePictureData.value = e.target.result;

            document.getElementById('hidden-nama').value = nama;
            document.getElementById('hidden-alamat').value = alamat;
            document.getElementById('hidden-nohp').value = nohp;
            document.getElementById('hidden-email').value = email;
            document.getElementById('hidden-profile-picture').value = e.target.result;

            document.getElementById('step1').style.display = 'none';
            document.getElementById('step2').style.display = 'block';
        };
        reader.readAsDataURL(fotoUpload.files[0]);
    };
});
