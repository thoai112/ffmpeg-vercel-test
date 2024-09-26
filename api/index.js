const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const prisma = require("../libs/prisma");
const pathToFfmpeg = require("ffmpeg-static");

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

  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      authorId: userId,
    },
    select: {
      pointerSequence: true,
    },
  });

  const pointers = await prisma.pointer.findMany({
    where: {
      projectId,
    },
    select: {
      id: true,
      imageName: true,
      audioName: true,
    },
  });

  let unavailableVideoInputs = false;
  for (let pointer of pointers) {
    if (pointer.imageName.length === 0 || pointer.audioName.length === 0) {
      unavailableVideoInputs = true;
      break;
    }
  }

  if (unavailableVideoInputs) {
    res.sendStatus(400);
    return;
  }

  const orderedPointers = [];
  project.pointerSequence.forEach((pointerId) => {
    const currentPointer = pointers.find((pointer) => pointer.id === pointerId);
    if (currentPointer) orderedPointers.push(currentPointer);
  });

  const modifiedDir = path.dirname(__dirname);
  const projectDirectoryPath = path.join(modifiedDir, userId, projectId);
  const videosDirectoryPath = path.join(projectDirectoryPath, "videos");

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
              return;
            }
            if (stderr) {
              console.log(`stderr: ${stderr}`);
              res.status(200).sendFile(outputVideoPath);
              return;
            }
            console.log(`stdout: ${stdout}`);
            console.log("Output video generated successfully");
            res.status(200).sendFile(outputVideoPath);
          },
        );
      },
    );
  });
}

generateAllVideos