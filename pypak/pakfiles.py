import os.path
import struct
import zlib
from collections import namedtuple

import dirfiles


def open_pakfile(filename):
    lowered = filename.lower()
    if lowered.endswith(".pak"):
        return PakFile(pakfilename=filename)
    if lowered.endswith(".dir"):
        return PakFile(dirfilename=filename)
    return PakFile(basefilename=filename)


class PakFile:
    def __init__(self, dirfilename=None, basefilename=None, pakfilename=None):
        if basefilename is None:
            if dirfilename is not None:
                basefilename = without_ext(dirfilename)
            elif pakfilename is not None:
                basefilename = without_ext(pakfilename)
            else:
                raise TypeError("need at least one filename parameter")
        if dirfilename is None:
            dirfilename = basefilename + ".dir"
        if pakfilename is None:
            pakfilename = basefilename + ".pak"

        self.dirfilename = dirfilename
        self.basefilename = basefilename
        self.pakfilename = pakfilename
        self.dir = dirfiles.read_dir_file(dirfilename)
        self.files = list(self.dir.entries)
        self.log = False

    def read(self, entry_path):
        entry = self.dir.entries[entry_path]
        return self._read_entry(entry)

    def _read_entry(self, entry):
        data = open_and_read_slice(self.pakfilename, entry.offset, entry.length)
        return decode_file_content(data)

    def extract(self, entrypath, destpath, makedirs=True):
        data = self.read(entrypath)
        if makedirs:
            fileparent = os.path.dirname(destpath)
            os.makedirs(fileparent, exist_ok=True)
        open_and_write(destpath, data)

    def extract_all_iter(self, destdir=None, sort=True):
        if destdir is None:
            destdir = self.basefilename
        entries = list(self.dir.entries)
        if sort:
            entries = sorted(entries)
        for i, current_entry in enumerate(entries):
            current_dest = os.path.join(destdir, current_entry)
            self._info_progress(i, len(entries), current_entry, current_dest)
            self.extract(current_entry, current_dest)
            yield Extracted(entry=current_entry, dest=current_dest)

    def extract_all(self, destdir=None, sort=True):
        return list(self.extract_all_iter(destdir=destdir, sort=sort))

    def _info_progress(self, i, total, current_entry, current_dest):
        if self.log:
            print(f"Extracting {i+1}/{total} '{current_entry}' into '{current_dest}'")


def open_and_write(filename, data):
    with open(filename, 'wb') as f:
        f.write(data)


def open_and_read_slice(filename, offset, length):
    with open(filename, 'rb') as f:
        return read_slice(f, offset, length)


def read_slice(f, offset, length):
    f.seek(offset)
    return f.read(length)


def decode_header(data):
    if len(data) < 4:
        return NOT_COMPRESSED
    magic, = struct.unpack(">I", data[0:4])
    magic = (magic ^ (magic >> 8)) & 0xffffff
    if magic != 0x7a330e:
        return NOT_COMPRESSED
    xorkey = xorkey_from_magic(magic)
    original_size, = struct.unpack("<I", data[4:8])
    original_size ^= xorkey
    return PakEntryHeader(is_compressed=True, original_size=original_size)


def xorkey_from_magic(magic):
    x = magic & 0xff
    if x >= 128:
        x -= 256
    x = ((x << 5) | (x >> 3)) & 0xff
    return x * 0x01010101


def decode_file_content(data):
    header = decode_header(data)
    if header.is_compressed:
        return zlib.decompress(data[8:])
    return data[1:]


def without_ext(filename):
    return os.path.splitext(filename)[0]


PakEntryHeader = namedtuple("PakEntryHeader", ["is_compressed", "original_size"])
Extracted = namedtuple("Extracted", ["entry", "dest"])
NOT_COMPRESSED = PakEntryHeader(is_compressed=False, original_size=-1)
