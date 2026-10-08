// Empties backend/dist WITHOUT removing the directory itself.
//
// nest-cli's deleteOutDir:true does an rmdir of the whole dist folder, which
// fails with EBUSY when dist is a Docker mount point. Removing only the
// *contents* is mount-safe, cross-platform, and still gives a clean build —
// so host and container can each own an isolated dist without clobbering.
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'dist');
if (fs.existsSync(dir)) {
  for (const entry of fs.readdirSync(dir)) {
    fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
  }
}
