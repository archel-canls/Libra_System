window.onload = function() {
    const cookies = document.cookie.split(';').map(c => c.trim());
    const errorCookie = cookies.find(c => c.startsWith('login_error='));
    if(errorCookie) {
        const errorMessage = decodeURIComponent(errorCookie.split('=')[1]);
        if(errorMessage) {
            const div = document.createElement('p');
            div.textContent = errorMessage;
            div.style.color = '#a30000';       
            div.style.textAlign = 'center';    
            div.style.marginTop = '8px';       
            div.className = 'error';
            document.querySelector('.auth-card p.text-center').after(div);
            document.cookie = "login_error=; path=/login; max-age=0";
        }
    }
}

document.addEventListener('DOMContentLoaded', function() {
    // Toggle password
    const passwordInput = document.getElementById('password');
    const toggleBtn = document.getElementById('toggle-password');
    const icon = toggleBtn.querySelector('i');

    toggleBtn.addEventListener('click', function() {
        if (passwordInput.type === 'password') {
            passwordInput.type = 'text';
            icon.classList.remove('fa-eye');
            icon.classList.add('fa-eye-slash');
        } else {
            passwordInput.type = 'password';
            icon.classList.remove('fa-eye-slash');
            icon.classList.add('fa-eye');
        }
    });

    // Tampilkan error dari cookie
    const cookies = document.cookie.split(';').map(c => c.trim());
    const errorCookie = cookies.find(c => c.startsWith('login_error='));
    if(errorCookie) {
        const errorMessage = decodeURIComponent(errorCookie.split('=')[1]);
        if(errorMessage) {
            const div = document.createElement('p');
            div.textContent = errorMessage;
            div.style.color = '#a30000';       
            div.style.textAlign = 'center';    
            div.style.marginTop = '8px';       
            div.className = 'error';
            document.querySelector('.auth-card p.text-center').after(div);
            document.cookie = "login_error=; path=/login; max-age=0";
        }
    }
});





