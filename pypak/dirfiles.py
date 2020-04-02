import struct
from collections import OrderedDict, namedtuple

PakFileEntry = namedtuple("PakFileEntry", ["path", "offset", "length"])


def read_dir_file(filename=None, readable=None, data=None):
    if data is not None:
        return _parse_dir_data(data)
    if filename is not None:
        with open(filename, 'rb') as readable:
            data = readable.read()
        return _parse_dir_data(data)
    if readable is not None:
        data = readable.read()
        return _parse_dir_data(data)
    raise Exception("must pass an argument")


def _parse_dir_data(data):
    dirfilereader = DirFileReader(data)
    dirfilereader.read_all()
    return dirfilereader.to_dirfile()


class DirFile:
    def __init__(self):
        self.entries = OrderedDict()


class DirFileReader:
    def __init__(self, data):
        self.current = bytearray()
        self.stack = []
        self.data = data
        self.cursor = 0
        self.entries = []
        self._finished = False

    def read_all(self):
        while not self._finished:
            self.read_next_char()

    def to_dirfile(self):
        result = DirFile()
        for entry in self.entries:
            result.entries[entry.path] = entry
        return result

    def read_struct0(self, fmt):
        end = self.cursor + struct.calcsize(fmt)
        data = self.data[self.cursor:end]
        self.cursor = end
        return struct.unpack(fmt, data)[0]

    def read_u8(self):
        return self.read_struct0("<B")

    def read_u32(self):
        return self.read_struct0("<I")

    def push_current(self):
        self.stack.append(bytes(self.current))

    def append_current(self, nextchar):
        self.current.append(nextchar)

    def read_next_char(self):
        nextchar = self.read_u8()
        cmd = self.read_u8()
        if cmd == 0x40:
            self.append_current(nextchar)
        elif cmd == 0xC0:
            self.push_current()
            self.append_current(nextchar)
        elif cmd == 0x08:
            self.append_current(nextchar)
            self.finalize_entry()
        elif cmd == 0x88:
            self.push_current()
            self.append_current(nextchar)
            self.finalize_entry()
        else:
            raise Exception(f"unknown dir tree node type {hex(cmd)}")

    def finalize_entry(self):
        offset = self.read_u32()
        length = self.read_u32()
        path = bytes(self.current).decode("ascii")
        self.entries.append(PakFileEntry(
            path=path, offset=offset, length=length
        ))
        if len(self.stack) == 0:
            self._finished = True
        else:
            self.current[:] = self.stack.pop()
