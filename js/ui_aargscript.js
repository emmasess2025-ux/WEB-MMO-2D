
document.addEventListener("DOMContentLoaded", () => {
    const btnOpen = document.getElementById("app-aargscript");

    if (btnOpen) {
        btnOpen.addEventListener("click", () => {
            // Se abre como una ventana emergente tipo popup/IDE
            window.open('studio.html', 'AargonStudio', 'width=1200,height=800,menubar=no,toolbar=no,location=no,status=no,resizable=yes');
        });
    }
});
