
document.addEventListener("DOMContentLoaded", () => {
    
    
    
    const fileInput = document.getElementById("asset-file");
    const canvas = document.getElementById("asset-canvas");
    const ctx = canvas.getContext("2d");
    const btnUpload = document.getElementById("btn-upload-asset");

    let currentFile = null;

    
    

    if (fileInput) {
        fileInput.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    canvas.width = img.width;
                    canvas.height = img.height;
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0);
                    canvas.style.display = "block";
                    currentFile = file;
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        });
    }

    if (btnUpload) {
        btnUpload.addEventListener("click", async () => {
            if (!currentFile) return alert("Please select a .png file first.");
            const name = document.getElementById("asset-name").value;
            if (!name) return alert("Please give your asset a name.");
            
            const type = document.getElementById("asset-type").value;
            
            const formData = new FormData();
            formData.append("image", currentFile);
            formData.append("assetName", name);
            formData.append("assetType", type);
            // Si el jugador est en un planeta, lo sacamos del window.player o ws
            const pId = (window.player && window.player.currentPlanet) ? window.player.currentPlanet : 'main';
            formData.append("planetId", pId);
            formData.append("width", canvas.width);
            formData.append("height", canvas.height);
            // Asumimos authEmail de ui_admin u otro lado, o usamos el JWT
            formData.append("ownerId", window.myId || 'guest');

            btnUpload.innerText = "Uploading...";
            btnUpload.disabled = true;

            try {
                const res = await fetch("/api/upload_asset", {
                    method: "POST",
                    body: formData
                });
                const data = await res.json();

                if (data.success) {
                    alert("Upload successful! URL: " + data.url);
                    
                } else {
                    alert("Upload failed: " + data.error);
                }
            } catch (err) {
                console.error(err);
                alert("Upload crashed.");
            } finally {
                btnUpload.innerText = "Upload to Cloudflare R2";
                btnUpload.disabled = false;
            }
        });
    }
});
