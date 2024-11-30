require("dotenv").config();

const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");
const path = require("path");
const { exec, spawn } = require("child_process");
const pathToFfmpeg = require("ffmpeg-static");
const express = require("express");
const app = express();
var pathToGo2rtc = require("go2rtc-static");


const process = spawn(pathToGo2rtc);
app.use(express.json());

async function generateVideo(
  orderedPointerFileIndex,
  compressedImageFilePath,
  audioFilePath,
  videosDirectoryPath,
) {
  return new Promise((resolve) => {
    const command = ffmpeg();

    command.input(compressedImageFilePath);
    command.input(audioFilePath);

    command.outputOptions([
      "-vf",
      "scale=1920:1080",
      "-pix_fmt",
      "yuv420p",
      "-crf",
      "18",
      "-preset",
      "slow",
      "-c:v",
      "libx264",
      "-c:a",
      "aac",
      "-strict",
      "experimental",
      "-movflags",
      "+faststart",
    ]);

    if (!fs.existsSync(videosDirectoryPath)) fs.mkdirSync(videosDirectoryPath);

    command
      .output(
        path.join(videosDirectoryPath, `video-${orderedPointerFileIndex}.mp4`),
      )
      .on("end", () => {
        console.log(
          `Video file video-${orderedPointerFileIndex}.mp4 generated successfully`,
        );
        resolve();
      });

    command.run();
  });
}

async function generateAllVideos(userId, projectId, res) {
  ffmpeg.setFfmpegPath(pathToFfmpeg);

  const modifiedDir = path.dirname(__dirname);
  const projectDirectoryPath = path.join(modifiedDir, userId, projectId);
  const videosDirectoryPath = path.join(projectDirectoryPath, "videos");

  const finalVideoPath = path.join(projectDirectoryPath, "result.mp4");
  if (fs.existsSync(finalVideoPath)) fs.unlinkSync(finalVideoPath);

  const orderedPointers = [
    {
      imageName: "image-1.jpeg",
      audioName: "audio-1.mp3",
    },
    {
      imageName: "image-2.jpeg",
      audioName: "audio-2.mp3",
    },
    {
      imageName: "image-3.jpeg",
      audioName: "audio-3.mp3",
    },
    {
      imageName: "image-4.jpeg",
      audioName: "audio-4.mp3",
    },
    {
      imageName: "image-5.jpeg",
      audioName: "audio-5.mp3",
    },
  ];

  Promise.all(
    orderedPointers.map((orderedPointer) => {
      const compressedImageFilePath = path.join(
        projectDirectoryPath,
        "compressedImages",
        orderedPointer.imageName,
      );
      const audioFilePath = path.join(
        projectDirectoryPath,
        "audios",
        orderedPointer.audioName,
      );

      const orderedPointerFileIndex = parseInt(
        orderedPointer.imageName.slice(6),
      );

      return generateVideo(
        orderedPointerFileIndex,
        compressedImageFilePath,
        audioFilePath,
        videosDirectoryPath,
      );
    }),
  ).then(() => {
    const videoClipPaths = [];
    // Assuming you have generated video clips with the same naming convention
    orderedPointers.forEach((orderedPointer) => {
      const orderedPointerFileIndex = parseInt(
        orderedPointer.imageName.slice(6),
      );
      videoClipPaths.push(
        path.join(videosDirectoryPath, `video-${orderedPointerFileIndex}.mp4`),
      );
    });

    const concatListPath = path.join(projectDirectoryPath, "concatList.txt");
    fs.writeFile(
      concatListPath,
      videoClipPaths.map((path) => `file '${path}'`).join("\n"),
      (err) => {
        if (err) {
          console.log("Error writing the file concatList.txt");
          res.status(500).json({ message: "Something went wrong" })
          return;
        }

        const outputVideoPath = path.join(projectDirectoryPath, "result.mp4");

        exec(
          `ffmpeg -safe 0 -f concat -i ${concatListPath} -c copy ${outputVideoPath}`,
          (error, stdout, stderr) => {
            fs.unlinkSync(concatListPath);
            fs.rmSync(videosDirectoryPath, { recursive: true });
            if (error) {
              console.log(`error: ${error.message}`);
              res.status(500).json({ message: "Something went wrong" })
              return;
            }
            if (stderr) {
              console.log(`stderr: ${stderr}`);
              res.sendFile(finalVideoPath);
              return;
            }
            console.log(`stdout: ${stdout}`);
            console.log("Output video generated successfully");
          },
        );
      },
    );
  });
}

app.get("/test", (req, res) => {
  res.send("this is a test endpoint");
});

app.get("/merge", async (req, res) => {
  const userId = "66daa8d4d8b81a7d2e7d3cd4";
  const projectId = "66ea9d2cd3b6c2c6fefa63be";

  generateAllVideos(userId, projectId, res);
});


process.stdout.on('data', (data) => {
  console.log(`stdout: ${data}`);
});

process.stderr.on('data', (data) => {
  console.error(`stderr: ${data}`);
});

process.on('close', (code) => {
  console.log(`child process exited with code   
 ${code}`);
});
const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`server running at port ${port}`));
