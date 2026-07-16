// Reports references and matching 16-bit scalars for known ANGEL2 resource names.
// @category Angel2

import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.Instruction;
import ghidra.program.model.listing.InstructionIterator;
import ghidra.program.model.scalar.Scalar;
import ghidra.program.model.symbol.Reference;
import ghidra.program.model.symbol.ReferenceIterator;

public class ReportResourceReferences extends GhidraScript {
    private static final long DATA_SEGMENT_MODULE_OFFSET = 0x9920L;

    private static final String[][] TARGETS = {
        { "startup_table", "9a60" },
        { "set_txt", "9dcc" },
        { "war0_tst", "a45e" }
    };

    @Override
    protected void run() throws Exception {
        String[] args = getScriptArgs();
        String baseText = args.length > 0 ? args[0] : "0000:0000";
        Address base = currentProgram.getAddressFactory().getAddress(baseText);

        println("Program: " + currentProgram.getName() + ", base: " + base);

        for (String[] targetSpec : TARGETS) {
            String name = targetSpec[0];
            long moduleOffset = Long.parseLong(targetSpec[1], 16);
            long dsOffset = moduleOffset - DATA_SEGMENT_MODULE_OFFSET;
            Address target = base.add(moduleOffset);

            println(name + " target=" + target + " module=" +
                Long.toHexString(moduleOffset) + " DS=" + Long.toHexString(dsOffset));

            int referenceCount = 0;
            ReferenceIterator references =
                currentProgram.getReferenceManager().getReferencesTo(target);
            while (references.hasNext()) {
                Reference reference = references.next();
                printSite("xref", reference.getFromAddress(), reference.getOperandIndex(),
                    reference.getReferenceType().toString());
                referenceCount++;
            }
            println("  xrefs=" + referenceCount);

            int scalarCount = 0;
            InstructionIterator instructions =
                currentProgram.getListing().getInstructions(true);
            while (instructions.hasNext()) {
                Instruction instruction = instructions.next();
                for (int operand = 0; operand < instruction.getNumOperands(); operand++) {
                    for (Object object : instruction.getOpObjects(operand)) {
                        if (!(object instanceof Scalar)) {
                            continue;
                        }
                        Scalar scalar = (Scalar) object;
                        long value = scalar.getUnsignedValue();
                        if (value == dsOffset || value == moduleOffset) {
                            printSite("scalar=" + Long.toHexString(value),
                                instruction.getAddress(), operand, "");
                            scalarCount++;
                        }
                    }
                }
            }
            println("  matching-scalars=" + scalarCount);
        }
    }

    private void printSite(String kind, Address from, int operand, String detail) {
        Instruction instruction = getInstructionAt(from);
        Function function = getFunctionContaining(from);
        println("  " + kind + " from=" + from + " op=" + operand +
            " function=" + (function == null ? "<none>" : function.getName()) +
            " instruction=" + (instruction == null ? "<none>" : instruction.toString()) +
            (detail.isEmpty() ? "" : " " + detail));
    }
}
