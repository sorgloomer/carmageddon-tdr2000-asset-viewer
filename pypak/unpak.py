import argparse
import glob
import os

import pakfiles


def list_files(args):
    if args.recurse:
        return glob.glob(os.path.join(args.path, "**/*.dir"), recursive=True)
    return [args.path]


def main(args=None):
    if args is None:
        args = parse_args()

    files = list_files(args)
    for file in files:
        extract_pakfile(file, args.convert_tx)


def convert_tx_files(extract_result):
    for job in extract_result:
        if job.entry.lower().endswith(".tx"):
            convert_tx_file(job.dest)


def convert_tx_file(tx_file):
    import PIL.Image
    base = pakfiles.without_ext(tx_file)
    tga_candidates = glob.glob(base + "_*.tga")
    if not tga_candidates:
        print(f"Warning no tga candidate for {tx_file}")
    tga_candidate = max(tga_candidates, key=os.path.getsize)
    png_dest = tx_file + ".png"
    print(f"Converting {tx_file} member {tga_candidate} to {png_dest}")
    with PIL.Image.open(tga_candidate) as im:
        im.save(png_dest)


def extract_pakfile(file, convert_tx):
    pakfile = pakfiles.open_pakfile(file)
    pakfile.log = True
    print(f"Info dirfile {pakfile.dirfilename}")
    print(f"Info pakfile {pakfile.pakfilename}")
    print(f"Info destination {pakfile.basefilename}")
    extract_result = pakfile.extract_all()
    if convert_tx:
        convert_tx_files(extract_result)
    print(f"Finished extracting {pakfile.pakfilename}")


def create_argparser():
    parser = argparse.ArgumentParser()
    parser.add_argument("path")
    parser.add_argument("-r", "--recurse", action='store_true')
    parser.add_argument("--convert-tx", action='store_true')
    return parser


def parse_args():
    return create_argparser().parse_args()


if __name__ == "__main__":
    main()
